import {palmObservation} from './palm-sweep-depth.mjs?v=touch2.4.10-final';
import {sweepEndpoints} from './one-hand-sweep.mjs?v=touch2.4.10-final';
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
 const depth=o.scale/o.size,base=-s.points[0][2];
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
 const headScales=atNeck.map(o=>o.s.face.neckFitScale).filter(v=>Number.isFinite(v)&&v>=.25&&v<=4);
 if(headScales.length<3)return {error:'Keep your open palm against the visible neck for the final second so the head and neck can be aligned. Previous calibration kept.'};
 const headScale=median(headScales),neckDepth=median(atNeck.map(o=>o.backDepth));
 return {fit:{kind:'neck-sweep',version:2,headScale,nearDepth,endDepth,neckDepth,farDepth:neckDepth+.30,phoneTilt:PHONE_TILT_DEGREES,aspect:median(aspects),frames:samples.length}};
}
// Return camera-Z movement toward the camera, along the wrist's image ray.
export function rearPlaneCorrection(points,farDepth,tilt=0){
 if(!(farDepth>0)||!points?.length)return 0;
 const wrist=points[0],base=-wrist[2],alongRay=roomDepth(wrist,tilt);
 if(!(base>0&&alongRay>1e-6))return 0;
 const excess=Math.max(0,Math.max(...points.map(p=>roomDepth(p,tilt)))-farDepth);
 return excess*base/alongRay;
}
