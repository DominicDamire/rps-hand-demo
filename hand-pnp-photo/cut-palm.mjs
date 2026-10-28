import * as T from 'three';
// Remove triangles beyond a plane and close each resulting contour.
export function cutClosedPalm(geometry,plane){
 const a=geometry.attributes.position,index=geometry.index,triangles=[],edges=[],epsilon=1e-8;
 const at=i=>new T.Vector3().fromBufferAttribute(a,index?index.getX(i):i);
 for(let i=0;i<(index?.count??a.count);i+=3){
  const tri=[at(i),at(i+1),at(i+2)],poly=[],cross=[];
  for(let j=0;j<3;j++){const p=tri[j],q=tri[(j+1)%3],dp=plane.distanceToPoint(p),dq=plane.distanceToPoint(q);if(dp<=epsilon)poly.push(p);if((dp<0&&dq>0)||(dp>0&&dq<0)){const hit=p.clone().lerp(q,dp/(dp-dq));poly.push(hit);cross.push(hit);}}
  for(let j=1;j+1<poly.length;j++)triangles.push([poly[0],poly[j],poly[j+1]]);
  if(cross.length===2)edges.push(cross);
 }

 const key=p=>p.toArray().map(v=>Math.round(v/1e-7)).join(','),nodes=new Map(),links=new Map();
 for(const [a,b]of edges){const ka=key(a),kb=key(b);if(ka===kb)continue;nodes.set(ka,a);nodes.set(kb,b);if(!links.has(ka))links.set(ka,new Set());if(!links.has(kb))links.set(kb,new Set());links.get(ka).add(kb);links.get(kb).add(ka);}
 const normal=plane.normal,axis=Math.abs(normal.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0),u=new T.Vector3().crossVectors(axis,normal).normalize(),v=new T.Vector3().crossVectors(normal,u),used=new Set();let caps=0;
 for(const start of links.keys()){if(used.has(start))continue;const loop=[];let prev=null,current=start;
  for(let n=0;n<=nodes.size;n++){if(used.has(current))break;used.add(current);loop.push(nodes.get(current));const next=[...links.get(current)].find(k=>k!==prev&&!used.has(k))??(links.get(current).has(start)?start:null);prev=current;current=next;if(current===start)break;if(current===null)throw Error('Open palm cut contour');}
  if(current!==start||loop.length<3)throw Error('Invalid palm cap contour');
  const contour=loop.map(p=>new T.Vector2(p.dot(u),p.dot(v)));for(const ids of T.ShapeUtils.triangulateShape(contour,[])){const t=ids.map(i=>loop[i]);if(t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0])).dot(normal)<0)t.reverse();triangles.push(t);caps++;}
 }
 const positions=[],indices=[],vertices=new Map();for(const tri of triangles){if(tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])).lengthSq()<1e-20)continue;for(const p of tri){const k=key(p);if(!vertices.has(k)){vertices.set(k,positions.length/3);positions.push(...p.toArray());}indices.push(vertices.get(k));}}
 const out=new T.BufferGeometry();out.setAttribute('position',new T.Float32BufferAttribute(positions,3));out.setIndex(indices);out.computeVertexNormals();out.userData.cut={caps,removed:true};return out;
}
