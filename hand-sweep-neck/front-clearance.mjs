// Demo display constraint: rigid translation only; never change bone lengths.
export function frontClearance(points,box,padding=.05){
 if(!points.length||!box)return 0;
 const project=p=>[p.x/Math.max(.01,-p.z),p.y/Math.max(.01,-p.z)];
 const corners=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(project({x,y,z}));
 const h=points.map(project),range=(a,k)=>[Math.min(...a.map(p=>p[k])),Math.max(...a.map(p=>p[k]))];
 const hx=range(h,0),hy=range(h,1),bx=range(corners,0),by=range(corners,1),edge=padding/Math.max(.05,-box.max.z);
 if(hx[1]+edge<bx[0]||hx[0]-edge>bx[1]||hy[1]+edge<by[0]||hy[0]-edge>by[1])return 0;
 return Math.max(0,box.max.z+padding-Math.min(...points.map(p=>p.z)));
}
