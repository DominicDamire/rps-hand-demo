import {limitBaseSplay} from '../hand-pnp-photo/base-splay-limit.mjs?v=photo1';
import * as T from 'three';
import {DirectionStabilizer,fingerPlane,constrainFinger} from '../hand-pnp-photo/stability.mjs?v=photo1';
import {ContactLatch,fitContact} from '../hand-pnp-photo/contact-direct.mjs?v=photo1';
const FINGERS=['Thumb','Index','Middle','Ring','Pinky'];
export function directDriver(rig,tips){
 const matrices=new Map(rig.parts.map(m=>{m.userData.directRestMatrix??=m.matrix.clone();return [m,m.userData.directRestMatrix];}));let contact=null,lastSide=null,lastShape='';
 const stabilizer=new DirectionStabilizer(),contactLatch=new ContactLatch();
 return function(points,side,palmQ,dt,{staticInput=false,confirmDegrees=0,noiseDegrees=1,smoothingMs=0,movementThresholdMm=0,upperCoupling=0,lockUpper=true,baseSplay=true,contactPixels=0,contactReleasePixels=12,thickness=1,tipInset=0,lm,width,height}){
  if(lastSide!==side){contact=null;lastSide=side;lastShape='';}
  const p=points.map(v=>v.clone()),chains=[],lengths=[],inversePalm=palmQ.clone().invert();
  // Keep rigid attachments; copy only segment directions from the earlier direct tracker.
  for(let f=0;f<5;f++){
   const name=side+FINGERS[f],base=rig.rest[name+'1'].world.clone().sub(rig.rest[side+'Hand'].world).applyQuaternion(palmQ).add(p[0]);
   const chain=[base],lens=[];
   for(let k=1;k<=3;k++){const rest=k<3?rig.rest[name+(k+1)].world.clone().sub(rig.rest[name+k].world):tips[name].clone();const length=rest.length()+(k===3?tipInset/1000:0),i=1+4*f+k-1;let dir=points[i+1].clone().sub(points[i]);if(dir.lengthSq()<1e-10)dir=rest.clone().applyQuaternion(palmQ);const movementNoise=Math.atan2(Math.max(0,movementThresholdMm)/1000,Math.max(.001,length))*180/Math.PI;dir=stabilizer.update(name+k,dir.normalize().applyQuaternion(inversePalm),dt,Math.max(noiseDegrees,movementNoise),{observation:lm,confirmDegrees,smoothingMs}).applyQuaternion(palmQ);lens.push(length);chain.push(chain[k-1].clone().addScaledVector(dir,length));}
   chains.push(chain);lengths.push(lens);
  }
  contact=contactLatch.update(lm,lm,width,height,contactPixels>0,contactPixels,contactReleasePixels);
  // Upper joints of the four fingers are hinges: no added sideways or twist.
  // Establish the allowed plane before solving fingertip contact inside it.
  const restAcross=rig.rest[side+'Index1'].world.clone().sub(rig.rest[side+'Pinky1'].world);
  function restrictBase(f){
   const chain=chains[f],name=side+FINGERS[f],before=chain[1].clone().sub(chain[0]).normalize(),rest=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize();
   // A fist can have a 40-degree base and a 90-degree middle joint.
   // Folded upper joints also lock base splay, without locking forward flexion.
   const middle=chain[2].clone().sub(chain[1]).normalize(),tip=chain[3].clone().sub(chain[2]).normalize();
   const upperBend=Math.max(before.angleTo(middle),middle.angleTo(tip))*180/Math.PI;
   const local=before.clone().applyQuaternion(inversePalm),after=new T.Vector3().fromArray(limitBaseSplay(local.toArray(),rest.toArray(),restAcross.toArray(),70,upperBend)).applyQuaternion(palmQ);
   const correction=new T.Quaternion().setFromUnitVectors(before,after);for(let k=1;k<4;k++)chain[k].sub(chain[0]).applyQuaternion(correction).add(chain[0]);
  }
  if(baseSplay)for(let f=1;f<5;f++)restrictBase(f);
  const hinges=new Map();
  if(lockUpper)for(let f=1;f<5;f++){
   const chain=chains[f],baseDirection=chain[1].clone().sub(chain[0]).normalize();
   const name=side+FINGERS[f],restDirection=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize();
   const hinge=fingerPlane(restDirection,restAcross,palmQ,baseDirection);hinges.set(f,hinge);
   if(lockUpper)constrainFinger(chain,lengths[f],hinge,upperCoupling);
  }
  let contactGap=contact?fitContact(chains[0],chains[contact/4-1],lengths[0],lengths[contact/4-1],hinges.get(contact/4-1)):null;
  // A fingertip contact solve must also respect the MCP sideways limit.
  if(contact)for(let f=1;f<5;f++){if(baseSplay)restrictBase(f);if(lockUpper){const name=side+FINGERS[f],rest=rig.rest[name+'2'].world.clone().sub(rig.rest[name+'1'].world).normalize(),base=chains[f][1].clone().sub(chains[f][0]).normalize(),hinge=fingerPlane(rest,restAcross,palmQ,base);hinges.set(f,hinge);constrainFinger(chains[f],lengths[f],hinge,upperCoupling);}}
  if(contact)contactGap=chains[0][3].distanceTo(chains[contact/4-1][3]);
  for(let f=0;f<5;f++)for(let k=0;k<4;k++)p[1+4*f+k].copy(chains[f][k]);
  rig.root.position.set(0,0,0);rig.root.updateMatrixWorld(true);const hand=rig.joints[side+'Hand'];hand.position.copy(hand.parent.worldToLocal(p[0].clone()));rig.setWorldQuat(side+'Hand',palmQ);rig.refresh(hand);
  const shape=side+':'+thickness+':'+tipInset,shapeChanged=shape!==lastShape;
  for(let f=0;f<5;f++)for(let k=1;k<=3;k++){
   const name=side+FINGERS[f]+k,j=rig.joints[name],i=1+4*f+k-1,rest=k<3?rig.rest[side+FINGERS[f]+(k+1)].world.clone().sub(rig.rest[name].world):tips[side+FINGERS[f]].clone(),axis=rest.clone().normalize();
   const target=p[i+1].clone().sub(p[i]).normalize();j.position.copy(j.parent.worldToLocal(p[i].clone()));const facing=axis.clone().applyQuaternion(palmQ),q=new T.Quaternion().setFromUnitVectors(facing,target).multiply(palmQ);
   if(hinges.has(f)){
    // Two axes specify roll as well as direction, including fully curled tips.
    const restX=restAcross.clone().addScaledVector(axis,-restAcross.dot(axis)).normalize(),worldX=hinges.get(f);
    const restFrame=new T.Matrix4().makeBasis(restX,axis,new T.Vector3().crossVectors(restX,axis));
    const worldFrame=new T.Matrix4().makeBasis(worldX,target,new T.Vector3().crossVectors(worldX,target));
    q.setFromRotationMatrix(worldFrame.multiply(restFrame.invert()));
   }
   rig.setWorldQuat(name,q);rig.refresh(j);
   // Geometry transforms are changed ONLY by the user's thickness/inset controls.
   if(shapeChanged){const rot=new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),axis));const shapeMatrix=rot.clone().multiply(new T.Matrix4().makeScale(thickness,thickness,1+(k===3?tipInset/1000/rest.length():0))).multiply(rot.clone().invert());for(const m of rig.parts)if(m.parent===j){m.matrixAutoUpdate=false;m.matrix.copy(shapeMatrix).multiply(matrices.get(m));m.matrixWorldNeedsUpdate=true;}}
  }
  lastShape=shape;rig.root.updateMatrixWorld(true);return {points:p,contact,contactGap};
 };
}
