import * as T from 'three';

function response(angle,noise,dt,milliseconds){
 if(milliseconds<=0)return 1;
 const speed=T.MathUtils.smoothstep(angle,noise,Math.max(noise*5,.14));
 const slow=Math.max(.001,milliseconds/1000),quick=Math.min(.012,slow);
 return 1-Math.exp(-T.MathUtils.clamp(dt,.001,.1)/(slow*(1-speed)+quick*speed));
}

// Independent palm-local segment filters. Holding a quiet segment never holds
// another finger. Compare with the accepted output so slow movement accumulates.
export class HandJitterFilter {
 constructor(){this.reset();}
 reset(){this.fingers=new Map();this.palm=null;}
 filterFingers(chains,lengths,palmQ,dt,{fingerJitter=false,fingerDeadzone=1.5,fingerResponseMs=45}={}){
  if(!fingerJitter){this.fingers.clear();return;}
  const inverse=palmQ.clone().invert();
  for(let f=0;f<chains.length;f++){
   const c=chains[f],directions=[1,2,3].map(k=>c[k].clone().sub(c[k-1]).normalize().applyQuaternion(inverse));
   for(let k=1;k<4;k++){
    const key=f+':'+k,input=directions[k-1],prior=this.fingers.get(key)??input.clone();
    const angle=prior.angleTo(input),noise=fingerDeadzone*Math.PI/180;
    if(angle>noise){
     // Move only the excess beyond the noise radius: no step on release.
     const rotation=new T.Quaternion().setFromUnitVectors(prior,input);
     prior.applyQuaternion(new T.Quaternion().slerp(rotation,(angle-noise)/angle*response(angle,noise,dt,fingerResponseMs))).normalize();
    }
    this.fingers.set(key,prior);
    const d=prior.clone().applyQuaternion(palmQ);
    c[k].copy(c[k-1]).addScaledVector(d,lengths[f][k-1]);
   }
  }
 }
 filterPalm(input,dt,{palmJitter=false,palmDeadzone=.8,palmResponseMs=45}={}){
  if(!palmJitter||!this.palm){this.palm=input.clone();return input.clone();}
  const angle=this.palm.angleTo(input),noise=palmDeadzone*Math.PI/180;
  if(angle<=noise)return this.palm.clone();
  const alpha=(angle-noise)/angle*response(angle,noise,dt,palmResponseMs);
  this.palm.slerp(input,alpha).normalize();return this.palm.clone();
 }
}
