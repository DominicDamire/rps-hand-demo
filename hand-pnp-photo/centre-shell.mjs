import * as T from 'three';

// Restoring the authored surfaces reintroduced off-centre finger shells.
// Apply a continuous depth-only correction per finger. It moves both surfaces
// equally: projected silhouette, topology and reference joints stay unchanged.
export function centreFingerShells(rig, section) {
 const names=['Thumb','Index','Middle','Ring','Pinky'];
 let maximumShift=0, maximumProjectionShift=0, maximumTotalShift=0, iterations=0;
 for(const side of ['R','L']) {
  const report=rig.photoReference.report[side];
  const x=new T.Vector3().fromArray(report.cameraRight),y=new T.Vector3().fromArray(report.cameraUp);
  const z=new T.Vector3().crossVectors(x,y).normalize();
  for(let finger=0;finger<5;finger++) {
   const targets=rig.photoReference.targets[side].slice(1+4*finger,5+4*finger);
   const meshes=rig.parts.filter(m=>m.name.startsWith(side+names[finger]));
   const data=meshes.map(mesh=>({mesh,inverse:mesh.matrixWorld.clone().invert(),
    vertices:Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld))}));
   for(const row of data)row.original=row.vertices.map(v=>v.clone());
   const uv=targets.map(v=>new T.Vector2(v.dot(x),v.dot(y)));
   // Choose the closest projected bone segment once; preserve continuity at joints.
   for(const row of data)row.weights=row.vertices.map(v=>{
    const p=new T.Vector2(v.dot(x),v.dot(y));let best=null;
    for(let i=0;i<3;i++) {
     const edge=uv[i+1].clone().sub(uv[i]);
     const t=T.MathUtils.clamp(p.clone().sub(uv[i]).dot(edge)/Math.max(edge.lengthSq(),1e-16),0,1);
     const distance=p.distanceToSquared(uv[i].clone().addScaledVector(edge,t));
     if(!best||distance<best.distance)best={i,t,distance};
    }
    return best;
   });
   for(let iteration=0;iteration<48;iteration++) {
    const correction=targets.map(point=>{
     let pair=null;
     for(const row of data){const hit=section(row.mesh,row.vertices,point,x,y,z);if(hit&&(!pair||hit[1]-hit[0]>pair[1]-pair[0]))pair=hit;}
     if(!pair)throw Error('Missing finger shell at reference joint');
     return point.dot(z)-(pair[0]+pair[1])/2;
    });
    if(Math.max(...correction.map(Math.abs))<1e-10)break;
    iterations=Math.max(iterations,iteration+1);
    for(const row of data)for(let i=0;i<row.vertices.length;i++){
     const w=row.weights[i],delta=correction[w.i]*(1-w.t)+correction[w.i+1]*w.t;
     row.vertices[i].addScaledVector(z,delta);maximumShift=Math.max(maximumShift,Math.abs(delta));
    }
   }
   for(const row of data){
    const attribute=row.mesh.geometry.attributes.position;
    row.vertices.forEach((v,i)=>{const p=v.clone().applyMatrix4(row.inverse);attribute.setXYZ(i,p.x,p.y,p.z);});
    for(let i=0;i<attribute.count;i++){
     const delta=new T.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(row.mesh.matrixWorld).sub(row.original[i]);
     maximumProjectionShift=Math.max(maximumProjectionShift,Math.hypot(delta.dot(x),delta.dot(y)));
     maximumTotalShift=Math.max(maximumTotalShift,delta.length());
    }
    attribute.needsUpdate=true;row.mesh.geometry.computeVertexNormals();row.mesh.geometry.computeBoundingBox();row.mesh.geometry.computeBoundingSphere();
   }
  }
 }
 rig.photoReference.shellCentring={maximumStepMm:maximumShift*1000,maximumTotalShiftMm:maximumTotalShift*1000,maximumProjectionShiftMm:maximumProjectionShift*1000,iterations};
}
