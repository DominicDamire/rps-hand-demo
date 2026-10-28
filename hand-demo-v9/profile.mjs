export const FINGERS=['Thumb','Index','Middle','Ring','Pinky'];
export const JOINTS=FINGERS.flatMap(n=>[1,2,3].map(i=>n+i));
export const blankAngles=()=>Object.fromEntries(JOINTS.map(n=>[n,[0,0,0]]));
export const blankLimits=()=>Object.fromEntries(JOINTS.map(n=>[n,[0,1,2].map(()=>({enabled:false,min:-180,max:180}))]));
export const emptyProfile=()=>({schema:'hand-pose-lab',version:1,rig:'ball-joint-doll-v80',axes:'anatomical-local-XYZ',tolerance:.18,calibration:{depthScale:1,neutralSplay:{R:{},L:{}}},limits:{R:blankLimits(),L:blankLimits()},poses:[]});
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=v=>{const n=Math.hypot(...v);if(n<1e-7)throw Error('Palm landmarks are degenerate');return v.map(x=>x/n);};
export function features(points){
 if(!Array.isArray(points)||points.length!==21||points.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>!Number.isFinite(x))))throw Error('Expected 21 finite world landmarks');
 const up=sub(points[9],points[0]),scale=Math.hypot(...up),y=unit(up),rawX=sub(points[5],points[17]),x=unit(rawX.map((v,i)=>v-dot(rawX,y)*y[i]));
 const z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
 return points.flatMap(p=>{const v=sub(p,points[0]);return [dot(v,x)/scale,dot(v,y)/scale,dot(v,z)/scale];});
}
export function matchPose(profile,feature,side){
 let best=null;
 for(const pose of profile.poses){if(pose.side!==side)continue;const thumbDistance=Math.max(...[1,2,3,4].map(i=>Math.hypot(...[0,1,2].map(k=>feature[i*3+k]-pose.features[i*3+k]))));if(thumbDistance>profile.tolerance*1.5)continue;const distance=Math.sqrt(feature.reduce((s,v,i)=>s+(v-pose.features[i])**2,0)/60);if(distance<=profile.tolerance&&(!best||distance<best.distance))best={pose,distance};}
 return best;
}
export function clampAngles(angles,limits){return Object.fromEntries(JOINTS.map(n=>[n,angles[n].map((v,i)=>limits[n][i].enabled?Math.max(limits[n][i].min,Math.min(limits[n][i].max,v)):v)]));}
export function validateProfile(input){
 if(input?.schema!=='hand-pose-lab'||input.version!==1||input.rig!=='ball-joint-doll-v80'||input.axes!=='anatomical-local-XYZ')throw Error('This is not a compatible Hand Pose Lab profile');
 const out=emptyProfile();const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 if(input.calibration!=null){if(!finite(input.calibration.depthScale,.01,100))throw Error('Invalid depth calibration');out.calibration.depthScale=input.calibration.depthScale;for(const side of ['R','L'])for(const n of JOINTS){const v=input.calibration.neutralSplay?.[side]?.[n];if(v!=null){if(!finite(v,-180,180))throw Error('Invalid neutral alignment');out.calibration.neutralSplay[side][n]=v;}}}
 if(!finite(input.tolerance,.03,.4))throw Error('Invalid match tolerance');out.tolerance=input.tolerance;
 for(const side of ['R','L'])for(const n of JOINTS)for(let a=0;a<3;a++){
  const l=input.limits?.[side]?.[n]?.[a];if(!l||typeof l.enabled!=='boolean'||!finite(l.min,-180,180)||!finite(l.max,-180,180)||l.min>l.max)throw Error('Invalid joint limits: '+side+n);
  out.limits[side][n][a]={enabled:l.enabled,min:l.min,max:l.max};
 }
 if(!Array.isArray(input.poses)||input.poses.length>100)throw Error('A profile can contain at most 100 poses');const ids=new Set();
 for(const p of input.poses){
  if(typeof p.id!=='string'||p.id.length>100||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||!['R','L'].includes(p.side))throw Error('Invalid or duplicate pose');ids.add(p.id);
  if(!Array.isArray(p.features)||p.features.length!==63||!p.features.every(x=>finite(x,-20,20)))throw Error('Invalid pose signature');
  const angles=blankAngles();for(const n of JOINTS){if(!Array.isArray(p.angles?.[n])||p.angles[n].length!==3||!p.angles[n].every(x=>finite(x,-180,180)))throw Error('Invalid angles: '+n);angles[n]=[...p.angles[n]];}
  let capture=null;if(p.capture!=null){if(typeof p.capture!=='string'||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(p.capture)||p.capture.length>700000)throw Error('Invalid saved image');capture=p.capture;}
  if(p.thumbReference!=null&&!finite(p.thumbReference,0,1))throw Error('Invalid thumb reference');
  if(p.referenceCurl!=null&&(!Array.isArray(p.referenceCurl)||p.referenceCurl.length!==4||!p.referenceCurl.every(x=>finite(x,0,1))))throw Error('Invalid reference curl');
  if(p.solvedAngles!=null)for(const n of JOINTS)if(!Array.isArray(p.solvedAngles[n])||p.solvedAngles[n].length!==3||!p.solvedAngles[n].every(x=>finite(x,-180,180)))throw Error('Invalid solved pose');
  out.poses.push({...(p.thumbReference!=null?{thumbReference:p.thumbReference}:{}),...(p.solvedAngles?{solvedAngles:structuredClone(p.solvedAngles)}:{}),...(p.referenceCurl?{referenceCurl:[...p.referenceCurl],referenceEnabled:p.referenceEnabled!==false}:{}),id:p.id,name:p.name.trim(),side:p.side,features:[...p.features],angles,capture});
 }
 return out;
}

// Structural constraints take precedence over user limits and imported poses.
export const lockedAxis=(name,axis)=>axis===2||(axis===1&&!name.endsWith('1')&&name!=='Thumb2');
export function constrainJoint(name,values,limits){return values.map((v,i)=>lockedAxis(name,i)?0:limits?.[i]?.enabled?Math.max(limits[i].min,Math.min(limits[i].max,v)):v);}
export const constrainAngles=(angles,limits)=>Object.fromEntries(JOINTS.map(n=>[n,constrainJoint(n,angles[n],limits[n])]));
export function directionAngles(name,[x,y,z],previous=0){
 const radial=Math.hypot(y,z),bend=radial<1e-8?previous:Math.atan2(-y,z)*180/Math.PI;
 return [bend,(name.endsWith('1')||name==='Thumb2')?Math.atan2(x,radial)*180/Math.PI:0,0];
}
