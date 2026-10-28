import * as THREE from 'three';
// Keep the original slimmer v80 shells, shortening their axes and matching bone length.
export function shortenThumb(rig,factor=.85){
 rig.root.updateMatrixWorld(true);
 for(const side of ['R','L']){
  const direction=rig.rest[side+'Thumb3'].world.clone().sub(rig.rest[side+'Thumb2'].world).normalize();
  for(const k of [2,3]){const joint=rig.joints[side+'Thumb'+k];for(const mesh of rig.parts.filter(m=>m.name.startsWith(side+'Thumb'+k+'__'))){
   const local=joint.matrixWorld.clone().invert().multiply(mesh.matrixWorld),geometry=mesh.geometry.clone();geometry.applyMatrix4(local);
   const a=geometry.attributes.position,v=new THREE.Vector3();for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i);v.addScaledVector(direction,v.dot(direction)*(factor-1));a.setXYZ(i,v.x,v.y,v.z);}a.needsUpdate=true;geometry.computeVertexNormals();
   mesh.geometry=geometry;mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);
  }}
  rig.joints[side+'Thumb3'].position.multiplyScalar(factor);
  rig.rest[side+'Thumb3'].world.sub(rig.rest[side+'Thumb2'].world).multiplyScalar(factor).add(rig.rest[side+'Thumb2'].world);
 }
 rig.root.updateMatrixWorld(true);
}
