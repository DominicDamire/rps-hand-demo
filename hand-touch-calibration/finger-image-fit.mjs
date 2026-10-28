// Aim an extended fixed-length finger at its own tracked image, not the other
// hand. Rotating the chain preserves its lengths and internal hinge angles.
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const norm=a=>Math.hypot(...a),unit=a=>a.map(v=>v/norm(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function fitExtendedFinger(chain,lm,base,aspect,focal){
 if(!lm||!(aspect>0&&focal>0)||chain.some(p=>p[2]>=-.02))return null;
 const image=p=>[p.x*aspect,p.y],span=(a,b)=>norm(sub(image(lm[a]),image(lm[b])));
 if(![0,9,base,base+1,base+2,base+3].every(i=>Number.isFinite(lm[i]?.x)&&Number.isFinite(lm[i]?.y)))return null;
 const path=[0,1,2].reduce((n,k)=>n+span(base+k,base+k+1),0),reach=span(base,base+3);
 if(reach<.5*span(0,9)||reach<.96*path)return null;
 const origin=chain[0],tip=chain[3],chord=sub(tip,origin),radius=norm(chord);
 const length=[0,1,2].reduce((n,k)=>n+norm(sub(chain[k+1],chain[k])),0);
 if(radius<.9*length||radius<1e-5)return null; // folded fingers keep their current solve
 const target=lm[base+3],ray=unit([(target.x-.5)*aspect/focal,(.5-target.y)/focal,-1]);
 const projection=dot(ray,origin),discriminant=projection*projection-dot(origin,origin)+radius*radius;
 if(discriminant<-1e-12)return null; // unreachable without stretching: keep the tracked pose
 const before=unit(chord),project=p=>[focal*p[0]/-p[2],focal*p[1]/-p[2]];
 const score=points=>points.slice(1).reduce((error,p,k)=>{const q=project(p),v=lm[base+k+1];return error+(k===2?2:1)*((q[0]-(v.x-.5)*aspect)**2+(q[1]-(.5-v.y))**2);},0),original=score(chain);
 let best=null,bestScore=original;
 for(const distance of [projection-Math.sqrt(Math.max(0,discriminant)),projection+Math.sqrt(Math.max(0,discriminant))]){
  if(distance<=.02)continue;
  const direction=unit(sub(ray.map(v=>v*distance),origin)),cos=Math.max(-1,Math.min(1,dot(before,direction)));
  if(cos<Math.cos(25*Math.PI/180))continue;
  const axis=cross(before,direction),sin=norm(axis);if(sin<1e-8)continue;
  const n=axis.map(v=>v/sin);
  const points=chain.map(p=>{const v=sub(p,origin),c=cross(n,v),d=dot(n,v);return v.map((x,i)=>origin[i]+x*cos+c[i]*sin+n[i]*d*(1-cos));});
  const error=score(points);
  if(error<bestScore*.98){bestScore=error;best={points,before:original,after:error};}
 }
 return best;
}
