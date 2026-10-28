import * as T from 'three';
// Palm-relative directions: wrist motion does not have to wait for finger filtering.
export class DirectionStabilizer {
 constructor(){this.values=new Map();this.fast=new Map();this.observations=new Map();this.accepted=new Map();this.pending=new Map();}
 update(key,input,dt,noiseDegrees=1,{observation=null,confirmDegrees=0,smoothingMs=90}={}){
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
  if(!prior){this.values.set(key,input.clone());return input.clone();}
  const angle=prior.angleTo(input),noise=noiseDegrees*Math.PI/180;
  if(noiseDegrees>0&&angle<=noise)return prior.clone();
  if(smoothingMs<=0){this.values.set(key,input.clone());return input.clone();}
  // Small changes use the selected response time; deliberate changes remain fast.
  const fast=Math.max(0,(this.fast.get(key)||0)-dt);
  this.fast.set(key,angle>Math.max(noise*5,.14)?.08:fast);
  const speed=this.fast.get(key)>0?1:T.MathUtils.smoothstep(angle,noise,Math.max(noise*5,.14));
  const slow=Math.max(.001,smoothingMs/1000),quick=Math.min(.012,slow),alpha=1-Math.exp(-Math.max(.001,Math.min(dt,.1))/(slow*(1-speed)+quick*speed));
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

export function constrainFinger(chain,lengths,hinge,coupling=0){
 // Snapshot both directions before moving any shared endpoint.
 const directions=[1,2,3].map(k=>chain[k].clone().sub(chain[k-1]).normalize());
 for(let k=2;k<=3;k++){
  const direction=directions[k-1].clone().addScaledVector(hinge,-directions[k-1].dot(hinge));
  if(k===3&&coupling>0){
   const first=directions[0].clone().addScaledVector(hinge,-directions[0].dot(hinge)).normalize(),second=directions[1].clone().addScaledVector(hinge,-directions[1].dot(hinge)).normalize();
   const sign=Math.sign(hinge.dot(new T.Vector3().crossVectors(first,second)))||1,equal=second.clone().applyAxisAngle(hinge,sign*first.angleTo(second));
   direction.applyQuaternion(new T.Quaternion().setFromUnitVectors(direction.clone().normalize(),equal).slerp(new T.Quaternion(),1-coupling)).normalize();
  }
  if(direction.lengthSq()<1e-8)direction.copy(directions[k-2]);
  chain[k].copy(chain[k-1]).addScaledVector(direction.normalize(),lengths[k-1]);
 }
}
