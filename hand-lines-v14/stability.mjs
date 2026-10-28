import * as T from 'three';
// Palm-relative directions: wrist motion does not have to wait for finger filtering.
export class DirectionStabilizer {
 constructor(){this.values=new Map();this.fast=new Map();this.observations=new Map();this.accepted=new Map();this.pending=new Map();}
 update(key,input,dt,noiseDegrees=1,{observation=null,confirmDegrees=0}={}){
  if(observation!==null&&confirmDegrees>0){
   if(this.observations.get(key)!==observation){
    this.observations.set(key,observation);
    const accepted=this.accepted.get(key),pending=this.pending.get(key),limit=confirmDegrees*Math.PI/180;
    if(!accepted||accepted.angleTo(input)<=limit){this.accepted.set(key,input.clone());this.pending.delete(key);}
    else if(pending&&pending.angleTo(input)<=Math.max(limit,accepted.angleTo(input)*.35)){this.accepted.set(key,input.clone());this.pending.delete(key);}
    else this.pending.set(key,input.clone());
   }
   input=this.accepted.get(key)||input;
  }else{this.accepted.set(key,input.clone());this.pending.delete(key);}
  const prior=this.values.get(key);
  if(!prior||noiseDegrees<=0){this.values.set(key,input.clone());return input.clone();}
  const angle=prior.angleTo(input),noise=noiseDegrees*Math.PI/180;
  if(angle<=noise)return prior.clone();
  // Small noise settles gently; deliberate changes use a 12 ms response.
  const fast=Math.max(0,(this.fast.get(key)||0)-dt);
  this.fast.set(key,angle>Math.max(noise*5,.14)?.08:fast);
  const speed=this.fast.get(key)>0?1:T.MathUtils.smoothstep(angle,noise,Math.max(noise*5,.14));
  const alpha=1-Math.exp(-Math.max(.001,Math.min(dt,.1))/(.09*(1-speed)+.012*speed));
  const rotation=new T.Quaternion().setFromUnitVectors(prior,input);
  prior.applyQuaternion(new T.Quaternion().slerp(rotation,alpha)).normalize();
  return prior.clone();
 }
}

export function fingerPlane(restDirection,restAcross,palmQ,baseDirection){
 const restHinge=restAcross.clone().addScaledVector(restDirection,-restAcross.dot(restDirection)).normalize();
 const swing=new T.Quaternion().setFromUnitVectors(restDirection.clone().applyQuaternion(palmQ),baseDirection);
 return restHinge.applyQuaternion(palmQ).applyQuaternion(swing).normalize();
}

export function constrainFinger(chain,lengths,hinge){
 // Snapshot both directions before moving any shared endpoint.
 const directions=[1,2,3].map(k=>chain[k].clone().sub(chain[k-1]).normalize());
 for(let k=2;k<=3;k++){
  const direction=directions[k-1].clone().addScaledVector(hinge,-directions[k-1].dot(hinge));
  if(direction.lengthSq()<1e-8)direction.copy(directions[k-2]);
  chain[k].copy(chain[k-1]).addScaledVector(direction.normalize(),lengths[k-1]);
 }
}
