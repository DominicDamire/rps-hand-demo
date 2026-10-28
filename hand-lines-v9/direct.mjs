import * as T from 'three';
const FINGERS=['Thumb','Index','Middle','Ring','Pinky'];
// Fixed-length FABRIK: only rotations/positions along rigid links change.
function reach(chain,lengths,target){const root=chain[0].clone(),total=lengths.reduce((a,b)=>a+b,0);if(root.distanceTo(target)>=total){const d=target.clone().sub(root).normalize();for(let i=1;i<4;i++)chain[i].copy(chain[i-1]).addScaledVector(d,lengths[i-1]);return;}
 for(let pass=0;pass<18;pass++){chain[3].copy(target);for(let i=2;i>=0;i--){const d=chain[i].clone().sub(chain[i+1]).normalize();chain[i].copy(chain[i+1]).addScaledVector(d,lengths[i]);}chain[0].copy(root);for(let i=1;i<4;i++){const d=chain[i].clone().sub(chain[i-1]).normalize();chain[i].copy(chain[i-1]).addScaledVector(d,lengths[i-1]);}if(chain[3].distanceTo(target)<1e-5)break;}}
export function directDriver(rig,tips){
 const matrices=new Map(rig.parts.map(m=>{m.userData.directRestMatrix??=m.matrix.clone();return [m,m.userData.directRestMatrix];}));let contact=null,lastSide=null,lastShape='';
 return function(points,side,palmQ,dt,{contactPixels=0,thickness=1,tipInset=0,lm,width,height}){
  if(lastSide!==side){contact=null;lastSide=side;lastShape='';}
  const p=points.map(v=>v.clone()),chains=[],lengths=[];
  // Keep rigid attachments; copy only segment directions from the earlier direct tracker.
  for(let f=0;f<5;f++){
   const name=side+FINGERS[f],base=rig.rest[name+'1'].world.clone().sub(rig.rest[side+'Hand'].world).applyQuaternion(palmQ).add(p[0]);
   const chain=[base],lens=[];
   for(let k=1;k<=3;k++){const rest=k<3?rig.rest[name+(k+1)].world.clone().sub(rig.rest[name+k].world):tips[name].clone();const length=rest.length()+(k===3?tipInset/1000:0),i=1+4*f+k-1;let dir=points[i+1].clone().sub(points[i]);if(dir.lengthSq()<1e-10)dir=rest.clone().applyQuaternion(palmQ);lens.push(length);chain.push(chain[k-1].clone().addScaledVector(dir.normalize(),length));}
   chains.push(chain);lengths.push(lens);
  }
  const distance=i=>Math.hypot((lm[4].x-lm[i].x)*width,(lm[4].y-lm[i].y)*height);
  if(!contactPixels)contact=null;else if(contact&&distance(contact)>contactPixels*1.5)contact=null;
  if(!contact&&contactPixels){const i=[8,12,16,20].sort((a,b)=>distance(a)-distance(b))[0];if(distance(i)<=contactPixels)contact=i;}
  if(contact){const other=contact/4-1,a=chains[0],b=chains[other];let target=a[3].clone().add(b[3]).multiplyScalar(.5);for(let pass=0;pass<8;pass++){reach(a,lengths[0],target);reach(b,lengths[other],target);target=a[3].clone().add(b[3]).multiplyScalar(.5);}}
  for(let f=0;f<5;f++)for(let k=0;k<4;k++)p[1+4*f+k].copy(chains[f][k]);
  rig.root.position.set(0,0,0);rig.root.updateMatrixWorld(true);const hand=rig.joints[side+'Hand'];hand.position.copy(hand.parent.worldToLocal(p[0].clone()));rig.setWorldQuat(side+'Hand',palmQ);rig.refresh(hand);
  const shape=side+':'+thickness+':'+tipInset,shapeChanged=shape!==lastShape;
  for(let f=0;f<5;f++)for(let k=1;k<=3;k++){
   const name=side+FINGERS[f]+k,j=rig.joints[name],i=1+4*f+k-1,rest=k<3?rig.rest[side+FINGERS[f]+(k+1)].world.clone().sub(rig.rest[name].world):tips[side+FINGERS[f]].clone(),axis=rest.clone().normalize();
   const target=p[i+1].clone().sub(p[i]);j.position.copy(j.parent.worldToLocal(p[i].clone()));const facing=axis.clone().applyQuaternion(palmQ),q=new T.Quaternion().setFromUnitVectors(facing,target.normalize()).multiply(palmQ);rig.setWorldQuat(name,q);rig.refresh(j);
   // Geometry transforms are changed ONLY by the user's thickness/inset controls.
   if(shapeChanged){const rot=new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),axis));const shapeMatrix=rot.clone().multiply(new T.Matrix4().makeScale(thickness,thickness,1+(k===3?tipInset/1000/rest.length():0))).multiply(rot.clone().invert());for(const m of rig.parts)if(m.parent===j){m.matrixAutoUpdate=false;m.matrix.copy(shapeMatrix).multiply(matrices.get(m));m.matrixWorldNeedsUpdate=true;}}
  }
  lastShape=shape;rig.root.updateMatrixWorld(true);return {points:p,contact};
 };
}
