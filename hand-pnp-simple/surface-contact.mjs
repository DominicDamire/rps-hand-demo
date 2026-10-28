import * as T from 'three';
// Find a visible hand vertex and its closest point on the actual bust triangles.
// The correction is a rigid translation; no finger length or angle is changed.
export function surfaceContact(vertices,triangles,clearance=.0003){
 const q=new T.Vector3();let best=null,distanceSq=Infinity;
 for(const source of vertices)for(const triangle of triangles){
  triangle.closestPointToPoint(source,q);const d=source.distanceToSquared(q);
  if(d<distanceSq){distanceSq=d;best={source:source.clone(),target:q.clone()};}
 }
 if(!best)return null;
 const distance=Math.sqrt(distanceSq),delta=best.target.clone().sub(best.source);
 if(distance>clearance)delta.multiplyScalar((distance-clearance)/distance);else delta.set(0,0,0);
 return {...best,delta,gapBefore:distance,gapAfter:Math.min(distance,clearance)};
}

// Place the inward-most mesh surface against the local outward-facing plane.
// This avoids mistaking an already intersecting palm for successful contact.
export function supportedContact(vertices,target,normal,clearance=.0003){
 if(!vertices.length)return null;
 const n=normal.clone().normalize();let source=null,min=Infinity;
 for(const vertex of vertices){const d=vertex.clone().sub(target).dot(n);if(d<min-1e-7||(Math.abs(d-min)<=1e-7&&source&&vertex.distanceToSquared(target)<source.distanceToSquared(target))){source=vertex;min=d;}}
 const destination=target.clone().addScaledVector(n,clearance),delta=destination.clone().sub(source);
 return {source:source.clone(),target:target.clone(),delta,gapBefore:source.distanceTo(target),gapAfter:clearance};
}
