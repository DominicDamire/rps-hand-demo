import {measureHand} from './controller.mjs?v=11';
export function indexExtension(p){
 if(p?.length!==21||!p.every(v=>[v.x,v.y,v.z].every(Number.isFinite)))return 0;
 const d=(a,b)=>Math.hypot(p[a].x-p[b].x,p[a].y-p[b].y,p[a].z-p[b].z);
 const length=d(5,6)+d(6,7)+d(7,8);
 // End-to-end reach tolerates a natural bend; a curled index loses reach.
 return length>1e-6?d(5,8)/length:0;
}
export function isPointing(p){return indexExtension(p)>=.88;}
export function measurePointer(image,world,aspect=4/3){
 if(image?.length!==21||!image.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))return null;
 const visible=image.map(p=>({x:p.x,y:p.y/aspect,z:0}));
 const hasWorld=world?.length===21&&world.every(p=>[p.x,p.y,p.z].every(Number.isFinite));
 const extension=indexExtension(hasWorld?world:visible);
 return {x:1-image[8].x,z:measureHand(image,world,aspect)?.z,extension};
}
// Relative displacement, not distance from a joystick centre: no motion while held still.
export class SwipeController{
 constructor(){this.gain=24;this.reverse=false;this.reset();}
 reset(){this.last=null;this.anchor=null;this.since=null;this.active=false;}
 update(s,t){
  const zero={dx:0,dz:0,yaw:0,active:false,status:'Hold your index out'};
  if(!s||![s.x,t].every(Number.isFinite)){this.reset();return zero;}
  const extension=s.extension??(s.pointing?1:0);
  if(extension<(this.active?.80:.88)){this.reset();return {...zero,status:'Movement off · return hand, then point again'};}
  if(this.last&&(t<=this.last.t||t-this.last.t>500||Math.abs(s.x-this.last.x)>.22))this.reset();
  this.since??=t;
  const previous=this.last;this.last={...s,t};
  if(!this.active){this.anchor={...s};this.active=true;return {...zero,active:true,status:'Movement ready · trace a path'};}
  const consume=(axis,slack)=>{const v=s[axis]-this.anchor[axis],out=Math.sign(v)*Math.max(0,Math.abs(v)-slack);this.anchor[axis]+=out;return out;};
  const validDepth=Number.isFinite(s.z)&&Number.isFinite(previous.z)&&Math.abs(s.z-previous.z)<.14;
  if(!validDepth)this.anchor.z=s.z;
  const depth=validDepth?(s.z+previous.z)/2:.5;
  let dx=consume('x',.003)*depth*1.1547*this.gain;
  let dz=validDepth?consume('z',.008)*this.gain*(this.reverse?-1:1):0;
  const length=Math.hypot(dx,dz),limit=20*(t-previous.t)/1000,k=length>limit?limit/length:1;
  dx*=k;dz*=k;
  return {...zero,dx,dz,active:true,status:length>0?'Moving · relax index to release':'Ready · holding still'};
 }
}

// Input pixels are unmirrored; MediaPipe handedness assumes mirrored selfie pixels.
// Therefore raw Right identifies the user's physical left hand.
export function selectLeftHand(result,minConfidence=.7){
 const matches=[];
 for(let i=0;i<(result.landmarks?.length||0);i++){
  const h=result.handedness?.[i]?.[0];
  if(h?.categoryName==='Right'&&h.score>=minConfidence)matches.push(i);
 }
 return matches.length===1?matches[0]:-1;
}
