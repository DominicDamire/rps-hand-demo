import * as T from 'three';
// Keep the image rays; regularize only intermediate depth for clearly extended lines.
export function reduceFalseDepthBends(points,lm,width,height,perspective=true){
 const result=points.map(p=>p.clone()),screen=lm.map(p=>new T.Vector2(p.x*width,p.y*height));
 const palm=Math.max(1,screen[0].distanceTo(screen[9]));
 for(const base of [5,9,13,17]){
  const directions=[0,1,2].map(k=>screen[base+k+1].clone().sub(screen[base+k])),lengths=directions.map(v=>v.length());
  if(Math.min(...lengths)<1)continue;
  const bend=Math.max(...[0,1].map(k=>Math.acos(T.MathUtils.clamp(directions[k].dot(directions[k+1])/lengths[k]/lengths[k+1],-1,1))));
  const weight=(1-T.MathUtils.smoothstep(bend,8*Math.PI/180,18*Math.PI/180))*T.MathUtils.smoothstep(Math.min(...lengths)/palm,.07,.15)*T.MathUtils.smoothstep(screen[base].distanceTo(screen[base+3])/palm,.45,.75);
  if(weight<=0)continue;
  const start=points[base].z,end=points[base+3].z,total=lengths.reduce((a,b)=>a+b,0);let distance=0;
  for(let k=1;k<3;k++){
   distance+=lengths[k-1];const t=distance/total;
   const expected=perspective&&start*end>0?1/((1-t)/start+t/end):T.MathUtils.lerp(start,end,t);
   const z=T.MathUtils.lerp(points[base+k].z,expected,weight),p=result[base+k];
   if(perspective&&Math.abs(p.z)>1e-6){const scale=z/p.z;p.x*=scale;p.y*=scale;}p.z=z;
  }
 }
 return result;
}
