// All depths are positive camera distances in metres. MediaPipe local origins
// cancel only in within-model differences; never subtract raw hand and pose Z.
const palmIds=[5,9,13,17];
export const median=a=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:null;};
const finite=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const uv=(p,aspect)=>[(p.x-.5)*aspect,p.y-.5];
function offsets(hand,length=null){
 const w=hand?.world;if(!w||![0,...palmIds].every(i=>finite(w[i])))return null;
 const measured=median(palmIds.map(i=>distance(w[i],w[0])));if(!(measured>.02&&measured<.2))return null;
 const scale=length?length/measured:1;
 return {length:measured,points:palmIds.map(i=>({i,x:(w[i].x-w[0].x)*scale,y:(w[i].y-w[0].y)*scale,z:(w[i].z-w[0].z)*scale}))};
}
export function calibratePalm(hand,depth,aspect=1){
 const o=offsets(hand);if(!o||!(depth>.1&&depth<3))return null;
 const root=uv(hand.landmarks[0],aspect);let numerator=0,denominator=0;
 for(const p of o.points){const image=uv(hand.landmarks[p.i],aspect);for(let k=0;k<2;k++){const offset=k?p.y:p.x;numerator+=offset*(image[k]*(depth+p.z)-root[k]*depth);denominator+=offset*offset;}}
 const focal=numerator/denominator;if(!(focal>.3&&focal<5))return null;
 return {length:o.length,focal,depth};
}
export function projectivePalmDepth(hand,reference,aspect=1){
 const o=offsets(hand,reference?.length);if(!o||!reference?.focal)return null;
 const root=uv(hand.landmarks[0],aspect);let numerator=0,denominator=0;
 for(const p of o.points){const image=uv(hand.landmarks[p.i],aspect);for(let k=0;k<2;k++){const d=image[k]-root[k],offset=k?p.y:p.x;numerator+=d*(reference.focal*offset-image[k]*p.z);denominator+=d*d;}}
 const depth=numerator/denominator;if(!(denominator>1e-5&&depth>.08&&depth<4))return null;
 let error=0,span=0;
 for(const p of o.points){if(depth+p.z<=.04)return null;const image=uv(hand.landmarks[p.i],aspect);for(let k=0;k<2;k++){const predicted=(root[k]*depth+reference.focal*(k?p.y:p.x))/(depth+p.z);error+=(predicted-image[k])**2;span+=(image[k]-root[k])**2;}}
 const residual=Math.sqrt(error/Math.max(span,1e-8));
 return residual<.18?{depth,residual}:null;
}
// Pair by visible wrist proximity, not handedness: the two detectors can disagree.
export function armObservation(hand,pose,aspect=1){
 if(!pose?.points||!pose?.world||!hand?.landmarks?.[0])return null;
 const p=pose.points,w=pose.world,good=i=>finite(w[i])&&p[i]&&p[i].x>=0&&p[i].x<=1&&p[i].y>=0&&p[i].y<=1&&p[i].visibility>=.65&&(p[i].presence??1)>=.65;
 if(!good(0)||!good(11)||!good(12))return null;
 const candidates=[[11,13,15],[12,14,16]].filter(ids=>ids.every(good)).map(ids=>({ids,error:Math.hypot((p[ids[2]].x-hand.landmarks[0].x)*aspect,p[ids[2]].y-hand.landmarks[0].y)})).sort((a,b)=>a.error-b.error);
 const best=candidates[0];if(!best||best.error>.06||candidates[1]&&candidates[1].error-best.error<.018)return null;
 const [s,e,r]=best.ids,upper=distance(w[s],w[e]),forearm=distance(w[e],w[r]),shoulder=distance(w[11],w[12]);
 if(upper<.08||forearm<.08||upper>.65||forearm>.65||shoulder<.12||shoulder>.8)return null;
 return {id:r,dz:w[r].z-w[0].z,upper,forearm,shoulder,error:best.error,confidence:Math.min(...[0,11,12,s,e,r].map(i=>p[i].visibility))};
}
export function fuseArmDepth(palmDepth,observation,reference,headDepth,ageMs=0){
 if(!observation||!reference||!Number.isFinite(headDepth)||!Number.isFinite(ageMs)||ageMs<0||ageMs>150)return {depth:palmDepth,weight:0,reason:'palm only'};
 if(observation.id!==reference.id)return {depth:palmDepth,weight:0,reason:'arm identity changed'};
 for(const key of ['upper','forearm','shoulder']){const ratio=observation[key]/reference[key];if(ratio<.75||ratio>1.3)return {depth:palmDepth,weight:0,reason:'uncertain arm shape'};}
 // Correct common pose scale drift from three calibrated, rigid segment lengths.
 const scale=median(['upper','forearm','shoulder'].map(k=>reference[k]/observation[k]));
 const armDepth=headDepth+observation.dz*scale-reference.dz;
 const disagreement=Math.abs(armDepth-palmDepth),tolerance=Math.max(.08,palmDepth*.25);
 const weight=.35*Math.max(0,1-ageMs/150)*Math.max(0,1-disagreement/tolerance)*Math.max(0,1-observation.error/.06);
 return {depth:palmDepth+(armDepth-palmDepth)*weight,weight,armDepth,reason:weight>.01?'palm + arm':'arm disagrees'};
}
export function finishScan(samples){
 if(samples.length<12||samples.at(-1).time-samples[0].time<800)return null;
 const depth=median(samples.map(s=>s.palm.depth)),length=median(samples.map(s=>s.palm.length)),focal=median(samples.map(s=>s.palm.focal));
 if(samples.some(s=>Math.abs(s.palm.depth/depth-1)>.06||Math.abs(s.palm.focal/focal-1)>.1||Math.abs(s.palm.length/length-1)>.12))return null;
 const arms=[...new Map(samples.filter(s=>s.arm).map(s=>[s.poseTime??s.time,s.arm])).values()];let arm=null;
 if(arms.length>=8&&arms.every(s=>s.id===arms[0].id)&&Math.max(...arms.map(s=>s.dz))-Math.min(...arms.map(s=>s.dz))<.06)arm=Object.fromEntries(['id','dz','upper','forearm','shoulder'].map(k=>[k,median(arms.map(s=>s[k]))]));
 return {palm:{depth,length,focal},arm};
}
