import {palmObservation} from './palm-sweep-depth.mjs?v=sweeppnp1';
import {sweepEndpoints} from './one-hand-sweep.mjs?v=sweeppnp1';
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
export const PHONE_TILT_DEGREES=10;
// Assume a phone leaning back, with its camera looking 10 degrees upward.
// Keep tracking/rendering in camera coordinates; use room depth only for
// the rear plane. This avoids tilting or scaling the mirror image twice.
export function roomDepth(p,tilt=PHONE_TILT_DEGREES){
 const angle=tilt*Math.PI/180;return -p[1]*Math.sin(angle)-p[2]*Math.cos(angle);
}
function observation(s){
 const o=palmObservation(s.landmarks,s.points,s.aspect,s.focal);
 if(!o?.reliable)return null;
 const depth=-s.points[0][2],base=depth;
 if(!(depth>.04&&depth<4&&base>0))return null;
 const points=s.points.map(p=>p.map((v,i)=>v+s.points[0][i]*(depth-base)/base));
 return {s,depth,backDepth:Math.max(...points.map(p=>roomDepth(p)))};
}
export function fitNeckSweep(samples){
 const {early,late}=sweepEndpoints(samples),start=early.map(observation).filter(Boolean),end=late.map(observation).filter(Boolean);
 if(start.length<3||end.length<3)return {error:'Need a clear palm at both endpoints. Start: '+start.length+'/3; neck: '+end.length+'/3. Keep the whole hand visible, palm facing you.'};
 const aspects=[...start,...end].map(o=>o.s.aspect);
 if(Math.max(...aspects)-Math.min(...aspects)>.01)return {error:'Camera framing changed during capture. Keep the phone orientation and camera quality unchanged, then retry.'};
 const nearDepth=median(start.map(o=>o.depth)),endDepth=median(end.map(o=>o.depth));
 if(endDepth<nearDepth*1.05)return {error:'The hand needs to move farther from the camera. Start fully extended toward the camera, then move back to your neck.'};
 // No upward-motion or crown-position gate. The user declares the neck
 // contact; face visibility is only an endpoint quality check.
 const atNeck=end.filter(o=>o.s.face);
 if(atNeck.length<3)return {error:'Keep your face visible as you finish at your neck.'};
 const anchors=atNeck.filter(o=>[o.s.face.neckContact?.neck,o.s.face.neckContact?.palm].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)&&p[2]<-.04));
 if(anchors.length<3)return {error:'Hold the palm gently against your neck just below the jaw for the final second. Need at least three clear neck observations.'};
 // Preserve V10 palm projection while jointly fitting both model scales.
 // Scale every hand point with its depth, not just the wrist translation.
 const ratio=median(anchors.map(o=>(-o.s.face.neckContact.palm[2])/-o.s.face.neckContact.neck[2]));
 // Contact determines relative scale, not absolute metres. Equal squared
 // log-scale priors split the correction between hand and bust models.
 const headScale=Math.sqrt(ratio),handScale=1/headScale;
 if(headScale<.25||headScale>4)return {error:'Head and hand scale mismatch is too large. Keep the face and whole palm clearly visible and retry.'};
 const offsets=anchors.map(o=>o.s.face.neckContact.palm.map((v,k)=>handScale*v-headScale*o.s.face.neckContact.neck[k]));
 const headOffset=[0,1,2].map(k=>median(offsets.map(p=>p[k])));
 const errors=offsets.map(p=>Math.hypot(...p.map((v,k)=>v-headOffset[k]))).sort((a,b)=>a-b);
 const residual=errors[Math.floor(.8*(errors.length-1))];
 if(residual>.03)return {error:'The finishing contact moved too much. Hold the palm at the same spot below the jaw for the final second.'};
 const neckDepth=handScale*median(anchors.map(o=>o.backDepth));
 const shoulderSamples=anchors.map(o=>o.s.face.neckContact.shoulderDepth).filter(v=>v>.04);
 const shoulderDepth=shoulderSamples.length>=3?headScale*median(shoulderSamples)-headOffset[2]:null;
 const shoulderPoints=anchors.map(o=>o.s.face.neckContact.shoulderPoint).filter(p=>p?.length===3&&p.every(Number.isFinite));
 const shoulderPoint=shoulderPoints.length>=3?[0,1,2].map(k=>headScale*median(shoulderPoints.map(p=>p[k]))+headOffset[k]):null;
 const shoulderDistance=shoulderPoint?Math.hypot(...shoulderPoint):null;
 return {fit:{kind:'neck-sweep',version:6,shoulderDepth,shoulderPoint,shoulderDistance,depthGain:handScale,handScale,headScale,headOffset,contactResidual:residual,nearDepth:nearDepth*handScale,endDepth:endDepth*handScale,neckDepth,farDepth:neckDepth+.30,phoneTilt:PHONE_TILT_DEGREES,aspect:median(aspects),frames:samples.length}};
}
// Return camera-Z movement toward the camera, along the wrist's image ray.
export function rearPlaneCorrection(points,farDepth,tilt=0){
 if(!(farDepth>0)||!points?.length)return 0;
 const wrist=points[0],base=-wrist[2],alongRay=roomDepth(wrist,tilt);
 if(!(base>0&&alongRay>1e-6))return 0;
 const excess=Math.max(0,Math.max(...points.map(p=>roomDepth(p,tilt)))-farDepth);
 return excess*base/alongRay;
}
