// Ported from mirror/head/spatial.mjs on the hand-rig-workflow branch (MEDIAPIPE-LICENSE.txt applies to the template).
// Canonical points from Google MediaPipe canonical_face_model.obj (Apache-2.0).
// Source: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
// Convert centimetres, Y-up/Z-out to eye-centred Y-down/Z-away; scale outer eyes to 90mm.
const source=[
 [33,-4.445859,2.663991,3.173422],[263,4.445859,2.663991,3.173422],
 [133,-1.856432,2.585245,3.757904],[362,1.856432,2.585245,3.757904],
 [168,0,3.271027,5.236015],[6,0,2.473255,5.788627],[197,0,1.728369,6.316750],
 [195,0,1.059413,6.774605],[5,0,.365669,7.242870],[4,0,-.463170,7.586580],
 [1,0,-1.126865,7.475604],[10,0,8.261778,4.481535],[151,0,6.545390,5.027311],
 [109,-1.891399,8.236377,4.274997],[338,1.891399,8.236377,4.274997],
 [67,-3.523964,8.005976,3.729163],[297,3.523964,8.005976,3.729163],
 [54,-6.279331,6.615427,1.425850],[284,6.279331,6.615427,1.425850],
 [127,-7.743095,2.364999,-2.005167],[356,7.743095,2.364999,-2.005167],
 [234,-7.664182,.673132,-2.435867],[454,7.664182,.673132,-2.435867]
];
export const template=source.map(([id,x,y,z])=>({id,point:[x,2.663991-y,3.173422-z].map(v=>v*.09/8.891718)}));
const bound=(v,a,b)=>Math.max(a,Math.min(b,v));
export const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
export function rotation([rx,ry,rz]){
 const a=Math.cos(rx),b=Math.sin(rx),c=Math.cos(ry),d=Math.sin(ry),e=Math.cos(rz),f=Math.sin(rz);
 return [e*c,e*d*b-f*a,e*d*a+f*b,f*c,f*d*b+e*a,f*d*a-e*b,-d,c*b,c*a];
}
export function project(point,parameters,focal){
 const r=rotation(parameters),[x,y,z]=point;
 const X=r[0]*x+r[1]*y+r[2]*z+parameters[3],Y=r[3]*x+r[4]*y+r[5]*z+parameters[4],Z=r[6]*x+r[7]*y+r[8]*z+parameters[5];
 return [focal*X/Z,focal*Y/Z];
}
function solve(a,b){
 const rows=a.map((r,i)=>[...r,b[i]]),n=b.length;
 for(let k=0;k<n;k++){
  let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;
  [rows[k],rows[pivot]]=[rows[pivot],rows[k]];
  if(Math.abs(rows[k][k])<1e-12)return null;
  const div=rows[k][k];for(let j=k;j<=n;j++)rows[k][j]/=div;
  for(let i=0;i<n;i++)if(i!==k){const v=rows[i][k];for(let j=k;j<=n;j++)rows[i][j]-=v*rows[k][j];}
 }
 return rows.map(r=>r[n]);
}

// Small six-parameter perspective fit; no second vision model or extra WASM.
// Robust weighted LM jointly fits orientation and eye-origin translation.
export function fitHead(points,aspect,prior,hfov=Math.PI/3,previous=null){
 if(!prior||!Number.isFinite(aspect)||aspect<=0||prior.span<.04)return null;
 const samples=template.filter(({id})=>points[id]&&[points[id].x,points[id].y].every(Number.isFinite)&&points[id].x>=0&&points[id].x<=1&&points[id].y>=0&&points[id].y<=1)
  .map(({id,point})=>({point,uv:[points[id].x-.5,(points[id].y-.5)/aspect]}));
 if(samples.length<16)return null;
 const focal=1/(2*Math.tan(hfov/2)),depth=bound(focal*.09/prior.span,.18,2);
 const fresh=[-prior.pitch,prior.yaw,Math.atan2((points[263].y-points[33].y)/aspect,points[263].x-points[33].x),(prior.centerX-.5)*depth/focal,(prior.centerY-.5)*depth/(focal*aspect),depth];
 const residual=p=>samples.flatMap(({point,uv})=>project(point,p,focal).map((v,i)=>v-uv[i]));
 const cost=rs=>rs.reduce((s,r)=>s+(Math.abs(r)<=.008?r*r:.016*Math.abs(r)-.000064),0);
 let p=previous&&cost(residual(previous))<cost(residual(fresh))?[...previous]:fresh,lambda=.0001;
 for(let iter=0;iter<14;iter++){
  const rs=residual(p),cols=p.map((_,j)=>{const q=[...p],eps=j<3?1e-4:1e-5;q[j]+=eps;return residual(q).map((v,i)=>(v-rs[i])/eps);});
  const a=Array.from({length:6},()=>Array(6).fill(0)),b=Array(6).fill(0);
  for(let i=0;i<rs.length;i++){
   const w=Math.min(1,.008/Math.max(1e-9,Math.abs(rs[i])));
   for(let j=0;j<6;j++){b[j]-=w*cols[j][i]*rs[i];for(let k=0;k<6;k++)a[j][k]+=w*cols[j][i]*cols[k][i];}
  }
  for(let j=0;j<6;j++)a[j][j]+=lambda*(1+a[j][j]);
  const step=solve(a,b);if(!step)break;
  const candidate=p.map((v,i)=>v+bound(step[i],i<3?-.3:-.12,i<3?.3:.12));candidate[5]=bound(candidate[5],.15,2.5);
  if(cost(residual(candidate))<cost(rs)){p=candidate;lambda=Math.max(1e-7,lambda*.3);if(Math.hypot(...step)<1e-6)break;}
  else lambda*=10;
 }
 const rs=residual(p),error=Math.sqrt(rs.reduce((s,r)=>s+r*r,0)/samples.length),r=rotation(p);
 if(!p.every(Number.isFinite)||error>Math.min(.025,prior.span*.12)||p[5]<.18||p[5]>2||r[8]<.25)return null;
 return {position:p.slice(3),yaw:Math.atan2(r[2],r[8]),pitch:Math.atan2(r[5],Math.hypot(r[2],r[8])),error,parameters:p};
}

// flip: per-axis signs applied to the offset. The branch default [-1,-1,1] turns the camera frame (x right, y down,
// z away) into its -z-looking player frame; rps_hand passes [1,1,1] and converts to its own frame outside.
export class SpatialPose{
 constructor(flip=[-1,-1,1]){this.flip=flip;this.neutral=null;this.scale=1;this.seen=-Infinity;this.target=[0,0,0];this.eye=[0,0,0];this.latest=null;}
 recenter(){this.neutral=null;this.target=[0,0,0];this.eye=[0,0,0];}
 calibrate(samples,distance=null){
  const center=[0,1,2].map(i=>median(samples.map(s=>s.position[i])));
  this.neutral=center;this.scale=distance?bound(distance/center[2],.4,2.5):1;this.target=[0,0,0];this.eye=[0,0,0];
 }
 receive(fit,now){
  if(!fit)return;
  this.latest=fit;this.seen=now;this.neutral??=[...fit.position];
  const raw=fit.position.map((v,i)=>(v-this.neutral[i])*this.scale*this.flip[i]);
  this.target=raw.map((v,i)=>bound(v,i===1?-.3:-.5,i===1?.3:.5));
 }
 update(now,dt,enabled=true){
  const target=enabled&&now-this.seen<650?this.target:[0,0,0];
  const moving=Math.hypot(...target.map((v,i)=>v-this.eye[i]))>.008;
  const a=1-Math.exp(-Math.min(dt,.1)/(moving?.016:.055));
  this.eye=this.eye.map((v,i)=>enabled?v+(target[i]-v)*a:0);return this.eye;
 }
}

// Requires stable, fresh samples spanning real time, not repeated render frames.
export class NeutralCapture{
 constructor(){this.samples=[];this.started=null;this.lastStamp=-1;}
 add(fit,stamp,now){
  if(!fit||now-stamp>300){this.samples=[];this.started=null;return false;}
  if(stamp===this.lastStamp)return false;this.lastStamp=stamp;
  const recent=this.samples.slice(-8),mean=recent.length?[0,1,2].map(i=>median(recent.map(s=>s.position[i]))):fit.position;
  if(recent.length&& (Math.hypot(...fit.position.map((v,i)=>v-mean[i]))>.015||Math.abs(fit.yaw-median(recent.map(s=>s.yaw)))>.1||Math.abs(fit.pitch-median(recent.map(s=>s.pitch)))>.1)){
   this.samples=[];this.started=null;
  }
  this.started??=now;this.samples.push(fit);
  return now-this.started>=2200&&this.samples.length>=16;
 }
 progress(now){return this.started===null?0:Math.min(1,(now-this.started)/2200);}
}
