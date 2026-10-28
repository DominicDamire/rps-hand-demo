import * as THREE from 'three';

// Replace mechanical shells with two rounded phalanges. Keep the real pivot tree.
export function buildThumbShape(rig){
 for(const side of ['R','L']){
  const source=rig.parts.find(m=>m.name.startsWith(side+'Hand__'));
  for(const k of [2,3]){
   const name=side+'Thumb'+k,joint=rig.joints[name],start=rig.rest[name].world;
   const direction=k===2?rig.rest[side+'Thumb3'].world.clone().sub(start):start.clone().sub(rig.rest[side+'Thumb2'].world);
   let length=direction.length();direction.normalize();
   if(k===3){let extent=0;for(const m of rig.parts.filter(m=>m.name.startsWith(name+'__'))){const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++)extent=Math.max(extent,new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld).sub(start).dot(direction));}length=extent;}
   const radius=k===2?.0095:.0085,points=[];
   // Rounded joint pad and fingertip; no nail extension is included.
   const shape=k===2?[[-.16,0],[-.12,.65],[0,1],[.25,1],[.55,.96],[.85,.9],[1,.82],[1.12,.5],[1.15,0]]:[[-.15,0],[-.1,.7],[0,1],[.28,1],[.55,.93],[.76,.77],[.9,.5],[.98,.18],[1,0]];
   for(const [t,r] of shape)points.push(new THREE.Vector2(radius*r,length*t));
   const geometry=new THREE.LatheGeometry(points,32),material=(Array.isArray(source.material)?source.material[0]:source.material).clone();material.flatShading=false;
   const mesh=new THREE.Mesh(geometry,material);mesh.name=name+'__rounded_phalanx';mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);mesh.frustumCulled=false;
   for(const old of rig.parts)if(old.name.startsWith(name+'__'))old.userData.hiddenThumbBase=true;
   joint.add(mesh);rig.parts.push(mesh);
  }
 }
}
