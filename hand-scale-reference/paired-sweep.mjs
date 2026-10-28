import {palmObservation} from './palm-sweep-depth.mjs?v=scale0925v2';
import {imagePalmSize} from './size-wall-depth.mjs';
import {solveTouchDepth} from './hand-pair-depth.mjs?v=scale0925v2';
import {sweepEndpoints} from './one-hand-sweep.mjs?v=scale0925v2';
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);

// Landmark 8 is the index fingertip. No nearest-finger switching during capture.
export function indexContactSample(hands,now,aspect=1,manual=0){
 const pair=['Left','Right'].map(label=>hands.find(h=>h.label===label));
 if(pair.some(h=>!h||now-h.seen>=350))return {reason:'Keep both hands visible.'};
 if(pair[0].time!==pair[1].time)return {reason:'Waiting for both hands in the same camera frame.'};
 if(pair.some(h=>h.confidence<.5))return {reason:'Left/right hand label uncertain.'};
 if(pair.some(h=>h.landmarks?.length!==21||h.points?.length!==21||!h.points.every(p=>p?.length===3&&p.every(Number.isFinite))))return {reason:'Waiting for both model hands.'};
 const sizes=pair.map(h=>imagePalmSize(h.landmarks,aspect));
 const inside=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-.04&&p.x<=1.04&&p.y>=-.04&&p.y<=1.04;
 if(pair.some(h=>![0,5,8,9,13,17].every(i=>inside(h.landmarks[i])))||sizes.some(s=>!s))return {reason:'Keep both palms and index fingertips inside the image.'};
 const dirs=pair.map(h=>{const a=h.landmarks[5],b=h.landmarks[8],v=[(b.x-a.x)*aspect,b.y-a.y],n=Math.hypot(...v);return n>1e-5?v.map(x=>x/n):null;});
 if(dirs.some(d=>!d)||dirs[0].reduce((s,v,i)=>s+v*dirs[1][i],0)>-.5)return {reason:'Point the two index fingers toward each other.'};
 const tips=pair.map(h=>h.landmarks[8]),gap=Math.hypot((tips[0].x-tips[1].x)*aspect,tips[0].y-tips[1].y),gapRatio=gap/Math.min(...sizes);
 if(gapRatio>.25)return {reason:'Bring the index fingertips together. Gap: '+Math.round(gapRatio*100)+'% of palm size.'};
 const [L,R]=pair,fit=solveTouchDepth(L.points[8],R.points[8],L.points[0],R.points[0],{maxSideChange:.015,surfaceGap:0});
 if(!fit)return {reason:'Contact geometry is ambiguous. Keep index fingers extended and pointing inward.'};
 const values=Object.fromEntries(pair.map((h,i)=>{
  const root=h.points[0],delta=i===0?fit.A:fit.B,depth=-(root[2]+delta[2]);
  return [i===0?'L':'R',{observation:palmObservation(h.landmarks,h.points,aspect,h.focal),size:sizes[i],depth:depth-manual,ray:root.map(v=>v/-root[2]),offset:sub(h.points[8],root)}];
 }));
 return {sample:{values,gapRatio,time:L.time,manual},reason:null};
}

export class PairedSweep {
 constructor(){this.cancel();}
 cancel(){this.started=null;this.samples=[];this.last=null;this.rejected={};}
 begin(now){this.cancel();this.started=now;}
 update(now,hands,face,aspect=1,manual=0){
  if(this.started===null)return null;
  const elapsed=now-this.started-5000;
  if(elapsed>=8000){
   const samples=this.samples,{early,late}=sweepEndpoints(samples),n=samples.filter(s=>s.elapsed>=0).length;
   const reason=Object.entries(this.rejected).sort((a,b)=>b[1]-a[1])[0]?.[0]||'Missing endpoint contact frames.';
   this.cancel();return {done:true,progress:8,...(n>=12&&early.length>=3&&late.length>=3?{samples}:{}),message:'Two-hand sweep finished: '+n+' paired frames; start '+early.length+'/3, neck '+late.length+'/3. '+reason};
  }
  const observed=indexContactSample(hands,now,aspect,manual);
  if(observed.sample&&observed.sample.time!==this.last&&elapsed>=-1000){this.last=observed.sample.time;this.samples.push({...observed.sample,elapsed,face});}
  if(elapsed<0)return {progress:0,message:'Starting in '+Math.ceil(-elapsed/1000)+' — hold index fingertips touching near the camera. '+(observed.reason||'Both index fingertips ready.')};
  if(observed.reason)this.rejected[observed.reason]=(this.rejected[observed.reason]||0)+1;
  return {progress:elapsed/1000,message:'Two-hand sweep '+(elapsed/1000).toFixed(1)+'/8.0 s — move BOTH hands back to the bottom of your neck, keeping index fingertips touching. '+this.samples.filter(s=>s.elapsed>=0).length+' paired frames. '+(observed.reason||'Contact recorded.')};
 }
}

function regression(rows){
 let weights=rows.map(()=>1),model;
 for(let pass=0;pass<4;pass++){
  let w=0,x=0,y=0,xx=0,xy=0;
  rows.forEach((r,i)=>{const a=1/r.size,b=r.depth,t=weights[i];w+=t;x+=a*t;y+=b*t;xx+=a*a*t;xy+=a*b*t;});
  const det=w*xx-x*x;if(det<=1e-8)return null;
  model={a:(y*xx-x*xy)/det,b:(w*xy-x*y)/det};
  const errors=rows.map(r=>Math.abs(r.depth-model.a-model.b/r.size)),scale=Math.max(.002,median(errors)*1.4826);
  weights=errors.map(e=>Math.min(1,1.5*scale/Math.max(e,1e-9)));
 }
 return model;
}
export function fitPairedSweep(samples){
 const {early,late}=sweepEndpoints(samples);
 if(samples.length<12||early.length<3||late.length<3)return {error:'Not enough paired start/end frames. Previous capture kept.'};
 const models={};
 for(const side of ['L','R']){
  const start=median(early.map(s=>s.values[side].size)),end=median(late.map(s=>s.values[side].size));
  if(start<=end*1.1)return {error:'Move both touching hands from near the camera back to your neck; keep the same hand orientation.'};
  const m=regression(samples.map(s=>s.values[side]));
  if(!m||m.b<=0||m.a+m.b/start<.04||m.a+m.b/end>4)return {error:'The contact observations did not give a usable near-to-far depth curve. Previous capture kept.'};
  models[side]=m;
 }
 const errors=samples.map(s=>{
  const position=side=>{const v=s.values[side],m=models[side],depth=m.a+m.b/v.size+s.manual;return v.offset.map((x,i)=>x+v.ray[i]*depth);};
  return Math.hypot(...sub(position('L'),position('R')));
 });
 return {fit:{kind:'index-pair',version:1,models,frames:samples.length,residualMm:1000*Math.sqrt(errors.reduce((a,b)=>a+b*b,0)/errors.length)}};
}
export function pairedSweepDepth(side,lm,aspect,fit,fallback){const size=imagePalmSize(lm,aspect),m=fit?.models?.[side];return size&&m?Math.max(.04,Math.min(4,m.a+m.b/size)):fallback;}
