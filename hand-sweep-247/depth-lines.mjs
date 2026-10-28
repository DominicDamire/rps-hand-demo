import * as T from 'three';
// Keep the image rays; regularize only intermediate depth for clearly extended lines.
export function reduceFalseDepthBends(points,lm,width,height,perspective=true){
 const result=points.map(p=>p.clone()),screen=lm.map(p=>new T.Vector2(p.x*width,p.y*height));
 const palm=Math.max(1,screen[0].distanceTo(screen[9]));
 for(const base of [5,9,13,17]){
  const directions=[0,1,2].map(k=>screen[base+k+1].clone().sub(screen[base+k])),lengths=directions.map(v=>v.length());
  if(Math.min(...lengths)<1)continue;
  const bend=Math.max(...[0,1].map(k=>Math.acos(T.MathUtils.clamp(directions[k].dot(directions[k+1])/lengths[k]/lengths[k+1],-1,1))));
  const weight=(1-T.MathUtils.smoothstep(bend,9*Math.PI/180,19*Math.PI/180))*T.MathUtils.smoothstep(Math.min(...lengths)/palm,.07,.15)*T.MathUtils.smoothstep(screen[base].distanceTo(screen[base+3])/palm,.45,.75);
  if(weight<=0){
   // A bend at PIP must not disable straight-DIP correction (or the reverse).
   // Short projected segments remain depth-ambiguous and keep the tracker Z.
   for(let pass=0;pass<4;pass++)for(let joint=1;joint<3;joint++){
    const a=base+joint-1,b=a+1,c=a+2,u=screen[b].clone().sub(screen[a]),v=screen[c].clone().sub(screen[b]),la=u.length(),lb=v.length();if(Math.min(la,lb)<1)continue;
    const angle=Math.acos(T.MathUtils.clamp(u.dot(v)/(la*lb),-1,1));
    const w=(1-T.MathUtils.smoothstep(angle,9*Math.PI/180,19*Math.PI/180))*T.MathUtils.smoothstep(Math.min(la,lb)/palm,.05,.12)*T.MathUtils.smoothstep((la+lb)/palm,.22,.4);if(w<=0)continue;
    const t=la/(la+lb),za=result[a].z,zc=result[c].z,expected=perspective&&za*zc>0?1/((1-t)/za+t/zc):T.MathUtils.lerp(za,zc,t),point=result[b],z=T.MathUtils.lerp(point.z,expected,w);
    if(perspective&&Math.abs(point.z)>1e-6){const scale=z/point.z;point.x*=scale;point.y*=scale;}point.z=z;
   }
   continue;
  }
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
