// One translation estimator: fixed mesh/camera scale / rotation-corrected palm span.
// Palm orientation only affects the projected-size correction; never a learned depth term.
export const PALM_EDGES=[[0,5],[0,9],[0,13],[0,17],[5,17]];
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
 return {size:ab/aa,length,scale:length*focal,facing,reliable:facing>=.18&&count>=3};
}
export class PalmSweepDepth {
 constructor(){this.reset();}
 reset(){this.states={};}
 update(side,observation,fit,fallback,time=0){
  let state=this.states[side];if(state&&time<state.time)state=null;if(state&&state.time===time)return state.depth;
  // Tilted rear planes are enforced after placement, along the image ray.
  const far=fit?.farDepth>0&&!fit.phoneTilt?fit.farDepth:4;
  const bound=d=>Math.max(.04,Math.min(far,d));
  // An edge-on/occluded palm does not provide enough evidence for a new depth.
  if(!observation?.reliable||!(observation.scale>0)){
   const depth=bound(state?.depth??fallback);this.states[side]={depth,time,held:true};return depth;
  }
  // Scale belongs to the fixed mesh and the current camera projection.
  // The neck sweep adds one frozen gain; it never changes with the gesture.
  // A joint fit scales the finished hand geometry and depth together.
  // Do not also translate the wrist here.
  const gain=fit?.handScale>0?1:fit?.depthGain>0?fit.depthGain:1;
  const target=gain*observation.scale/observation.size;
  if(!Number.isFinite(target)||target<=0)return bound(state?.depth??fallback);
  const depth=bound(target);this.states[side]={depth,time,held:false};return depth;
 }
}
