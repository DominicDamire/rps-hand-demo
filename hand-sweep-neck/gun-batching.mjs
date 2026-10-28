import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Only the editor's visual clone is batched; the grip rig and asset stay intact.
export function batchGun(model){
 model.updateWorldMatrix(true,true);
 const inverse=model.matrixWorld.clone().invert(), groups=new Map();
 model.traverseVisible(m=>{
  if(!m.isMesh||m.isSkinnedMesh||Array.isArray(m.material)||m.morphTargetInfluences||['Trigger_low','Sight_glass_low'].includes(m.name)||m.material.transparent)return;
  const key=m.material.uuid;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(m);
 });
 let removed=0,batches=0;
 for(const meshes of groups.values()){
  if(meshes.length<2)continue;
  const geometries=meshes.map(m=>{
   const g=m.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,m.matrixWorld));
   if(g.index){const flat=g.toNonIndexed();g.dispose();return flat;}return g;
  });
  const geometry=mergeGeometries(geometries,false);
  geometries.forEach(g=>g.dispose());
  if(!geometry)continue;
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new T.Mesh(geometry,meshes[0].material);mesh.name='Batched gun body';
  mesh.castShadow=meshes[0].castShadow;mesh.receiveShadow=meshes[0].receiveShadow;
  model.add(mesh);meshes.forEach(m=>m.removeFromParent());removed+=meshes.length;batches++;
 }
 return {removed,batches};
}
