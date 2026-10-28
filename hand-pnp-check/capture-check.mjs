export class StableCapture {
 constructor(){this.reset();}
 reset(){this.samples=[];this.since=null;this.last=null;this.origin=null;}
 update(now,sample,reason=''){
  if(!sample||reason){this.reset();return {done:false,progress:0,message:reason||'Waiting for a tracked hand.'};}
  if(sample.time===this.last)return {done:false,progress:this.since===null?0:Math.min(2,(now-this.since)/1000),message:'Waiting for a fresh frame.'};
  const p=sample.points[0];
  if(this.origin&&Math.hypot(...p.map((v,i)=>v-this.origin[i]))>.025)this.reset();
  if(this.since===null){this.since=now;this.origin=[...p];}
  this.last=sample.time;this.samples.push(sample);
  const progress=Math.min(2,(now-this.since)/1000),done=progress>=2&&this.samples.length>=10;
  return {done,progress,message:'Hold still: '+progress.toFixed(1)+'/2.0 seconds; '+this.samples.length+' valid frames.',samples:done?this.samples.slice():null};
 }
}
export function contactCheck(hands,rendered,aspect=1){
 if(hands.length<2)return {error:'Show both hands with index fingertips touching.'};
 const left=hands.find(h=>h.label==='Left'),right=hands.find(h=>h.label==='Right');
 if(!left||!right)return {error:'Waiting for distinct left and right hands.'};
 const a=left.landmarks[8],b=right.landmarks[8];
 if(Math.hypot((a.x-b.x)*aspect,a.y-b.y)>.025)return {error:'Bring the tracked index fingertips together.'};
 const p=rendered.L?.result?.points[8],q=rendered.R?.result?.points[8];
 if(!p||!q)return {error:'Waiting for both rendered fingertips.'};
 const distance=Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z);
 return {distance,passed:distance<=.015};
}
