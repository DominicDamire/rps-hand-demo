import * as THREE from 'three';
// Blender unions the palm and mound. Thumb-side vertices follow the MCP.
export async function buildThenar(rig){
 const response=await fetch(new URL('./palm-shape.json?v=8-final',import.meta.url));
 if(!response.ok)throw Error('Could not load the continuous palm mesh');
 const data=await response.json(),records=[];
 for(const side of ['R','L']){
  const source=rig.parts.find(m=>m.name.startsWith(side+'Hand__')),d=data[side];
  const geometry=new THREE.BufferGeometry(),rest=new Float32Array(d.position);
  geometry.setAttribute('position',new THREE.BufferAttribute(rest.slice(),3));geometry.setIndex(d.index);geometry.computeVertexNormals();
  const material=(Array.isArray(source.material)?source.material[0]:source.material).clone();material.flatShading=false;
  const mesh=new THREE.Mesh(geometry,material);mesh.name=side+'Hand__thumb_palm_mound';mesh.frustumCulled=false;
  for(const old of rig.parts)if(old.name.startsWith(side+'Hand__')||old.name.startsWith(side+'Thumb1__'))old.userData.hiddenThumbBase=true;
  rig.joints[side+'Hand'].add(mesh);rig.parts.push(mesh);
  records.push({side,geometry,rest,weights:d.weight,hand:rig.joints[side+'Hand'],bind:new THREE.Vector3().fromArray(d.bindMCP),target:new THREE.Vector3(),last:new THREE.Vector3(Infinity,Infinity,Infinity)});
 }
 return ()=>{for(const r of records){
  r.hand.worldToLocal(rig.joints[r.side+'Thumb2'].getWorldPosition(r.target));r.target.sub(r.bind);
  if(r.target.distanceToSquared(r.last)<1e-12)continue;r.last.copy(r.target);
  const a=r.geometry.attributes.position;
  for(let i=0;i<a.count;i++){const k=i*3,w=r.weights[i];a.setXYZ(i,r.rest[k]+r.target.x*w,r.rest[k+1]+r.target.y*w,r.rest[k+2]+r.target.z*w);}
  a.needsUpdate=true;r.geometry.computeVertexNormals();
 }};
}
