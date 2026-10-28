import * as T from 'three';
// Avatar-local -Z is forward. Limits apply in chest space, not viewing-camera space.
export function constrainArmDirections(upper, lower) {
 const u=upper.clone().normalize(), l=lower.clone().normalize();
 u.z=Math.min(0,u.z); if(u.lengthSq()<1e-8)u.set(0,-1,0);u.normalize();
 l.z=Math.min(0,l.z);if(l.lengthSq()<1e-8)l.copy(u);l.normalize();
 const angle=Math.min(u.angleTo(l),150*Math.PI/180);
 const bend=l.clone().addScaledVector(u,-l.dot(u));
 const forward=new T.Vector3(0,0,-1).addScaledVector(u,u.z);
 if(bend.lengthSq()>1e-8){
  // Reject reverse elbow bend; preserve the observed bend plane otherwise.
  if(forward.lengthSq()>1e-8&&bend.dot(forward)<-1e-8)bend.addScaledVector(forward,-bend.dot(forward)/forward.lengthSq());
  if(bend.lengthSq()<1e-8)bend.copy(forward);
  if(bend.lengthSq()>1e-8)l.copy(u).multiplyScalar(Math.cos(angle)).addScaledVector(bend.normalize(),Math.sin(angle));
 }
 l.z=Math.min(0,l.z);if(l.lengthSq()<1e-8)l.copy(u);l.normalize();
 return {upper:u,lower:l};
}
export function poseDirectArm(rig,side,shoulder,elbow,wrist,frontPlane=null){
 const q=rig.joints.Chest.getWorldQuaternion(new T.Quaternion()),inv=q.clone().invert();
 const a=elbow.clone().sub(shoulder),b=wrist.clone().sub(elbow);
 if(a.lengthSq()<1e-10||b.lengthSq()<1e-10)return false;
 const dirs=constrainArmDirections(a.applyQuaternion(inv),b.applyQuaternion(inv));
 // Optional conservative face plane: advance the upper arm enough that the
 // wrist cannot end behind it. This deliberately overrides estimated depth.
 if(frontPlane!==null){
  const origin=rig.joints[side+'UpperArm'].getWorldPosition(new T.Vector3()).applyQuaternion(inv);
  const length=rig.rest[side+'Forearm'].world.distanceTo(rig.rest[side+'UpperArm'].world);
  const maxZ=T.MathUtils.clamp((frontPlane-origin.z)/length,-1,0);
  if(dirs.upper.z>maxZ){const xy=Math.hypot(dirs.upper.x,dirs.upper.y),r=Math.sqrt(1-maxZ*maxZ);if(xy>1e-8){dirs.upper.x*=r/xy;dirs.upper.y*=r/xy;}else dirs.upper.y=-r;dirs.upper.z=maxZ;}
 }
 dirs.lower.copy(constrainArmDirections(dirs.upper,dirs.lower).lower);
 for(const [joint,next,dir] of [[side+'UpperArm',side+'Forearm',dirs.upper],[side+'Forearm',side+'Hand',dirs.lower]]){
  rig.aim(joint,rig.rest[next].world.clone().sub(rig.rest[joint].world),dir.applyQuaternion(q));
  rig.joints[joint].updateWorldMatrix(false,true);
 }
 return true;
}
