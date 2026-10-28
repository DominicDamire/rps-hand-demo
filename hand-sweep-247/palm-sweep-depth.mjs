// One translation estimator: fixed sweep scale / foreshortening-corrected palm span.
// Palm orientation only affects the projected-size correction; never a learned depth term.
export const PALM_EDGES=[[0,5],[0,9],[0,13],[0,17],[5,17]];
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const xyz=p=>Array.isArray(p)?p:[p?.x,p?.y,p?.z];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export function palmObservation(lm,points,aspect=1,focal=1){
 if(!(aspect>0)||!(focal>0)||!Number.isFinite(focal)||!lm||!points)return null;
 const p=points.map(xyz);if(![0,5,9,13,17].every(i=>p[i]?.every(Number.isFinite)&&Number.isFinite(lm[i]?.x)&&Number.isFinite(lm[i]?.y)))return null;
 const longitudinal=sub(p[9],p[0]),length=Math.hypot(...longitudinal),across=sub(p[5],p[17]);
 const n=[across[1]*longitudinal[2]-across[2]*longitudinal[1],across[2]*longitudinal[0]-across[0]*longitudinal[2],across[0]*longitudinal[1]-across[1]*longitudinal[0]],normalLength=Math.hypot(...n);
 if(length<1e-5||normalLength<1e-9)return null;
 const facing=Math.abs(n[2])/normalLength;let aa=0,ab=0,count=0;
 for(const [i,j]of PALM_EDGES){const d=sub(p[j],p[i]),full=Math.hypot(...d),projected=Math.hypot(d[0],d[1]);if(full<1e-5||projected/full<.25)continue;
  // Perspective correction relative to the wrist. This separates rotation
  // from translation even when the hand is close/off-centre in the image.
  const zi=p[i][2]-p[0][2],zj=p[j][2]-p[0][2];
  const ex=(d[0]+(lm[j].x-.5)*aspect/focal*zj-(lm[i].x-.5)*aspect/focal*zi)/length;
  const ey=(d[1]+(.5-lm[j].y)/focal*zj-(.5-lm[i].y)/focal*zi)/length;
  const ox=(lm[j].x-lm[i].x)*aspect,oy=lm[i].y-lm[j].y;
  aa+=ex*ex+ey*ey;ab+=ex*ox+ey*oy;count++;
 }
 if(aa<1e-7||ab<=0||count<2)return null;
 return {size:ab/aa,length,facing,reliable:facing>=.18&&count>=3};
}
export function fitPalmSweep(rows){
 const samples=rows.filter(r=>r.observation?.reliable&&r.depth>.04&&r.depth<4&&Number.isFinite(r.depth));
 if(samples.length<12)return null;
 const sizes=samples.map(r=>r.observation.size).sort((a,b)=>a-b);
 if(sizes[Math.floor(sizes.length*.9)]<sizes[Math.floor(sizes.length*.1)]*1.05)return null;
 const scale=median(samples.map(r=>r.observation.size*r.depth));
 const depths=samples.map(r=>r.depth).sort((a,b)=>a-b),neckDepth=median(depths.slice(Math.floor(depths.length*.9)));
 return {kind:'palm-sweep',scale,neckDepth,farDepth:neckDepth+.30,frames:samples.length};
}
export class PalmSweepDepth {
 constructor(){this.reset();}
 reset(){this.states={};}
 update(side,observation,fit,fallback,time=0){
  let state=this.states[side];if(state&&time<state.time)state=null;if(state&&state.time===time)return state.depth;
  const far=fit?.farDepth>0?fit.farDepth:4;
  const bound=d=>Math.max(.04,Math.min(far,d));
  // An edge-on/occluded palm does not provide enough evidence for a new depth.
  if(!observation?.reliable||!(fit?.scale>0)){
   const depth=bound(state?.depth??fallback);this.states[side]={depth,time,held:true};return depth;
  }
  const target=fit.scale/observation.size;
  if(!Number.isFinite(target)||target<=0)return bound(state?.depth??fallback);
  const depth=bound(target);this.states[side]={depth,time,held:false};return depth;
 }
}

export function fitOneHandPalmSweep(early,late,aspect=1){
 const start=early.map(s=>palmObservation(s.landmarks,s.points,aspect,s.focal)).filter(o=>o?.reliable);
 const end=late.map(s=>({observation:palmObservation(s.landmarks,s.points,aspect,s.focal),depth:s.face?.neckDepth})).filter(s=>s.observation?.reliable&&s.depth>.04&&s.depth<4);
 if(start.length<3||end.length<3)return null;
 const nearSize=median(start.map(o=>o.size)),farSize=median(end.map(s=>s.observation.size)),neckDepth=median(end.map(s=>s.depth));
 if(nearSize<=farSize*1.05)return null;
 return {kind:'palm-sweep',scale:neckDepth*farSize,neckDepth,farDepth:neckDepth+.30,frames:early.length+late.length};
}
