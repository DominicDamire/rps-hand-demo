// Knuckle/wrist spans avoid treating spread fingers as a larger/nearer hand.
export function palmSize(lm,world,aspect=1){
 const values=[];
 for(const [a,b] of [[0,5],[0,9],[0,13],[0,17],[5,17]]){
  if(!lm?.[a]||!lm?.[b]||!world?.[a]||!world?.[b])continue;
  const x=world[b].x-world[a].x,y=world[b].y-world[a].y,z=world[b].z-world[a].z;
  const length=Math.hypot(x,y,z),visible= Math.hypot(x,y)/Math.max(1e-8,length);
  if(visible<.35)continue;
  const span=Math.hypot((lm[b].x-lm[a].x)*aspect,lm[b].y-lm[a].y)/visible;
  if(Number.isFinite(span)&&span>1e-5)values.push(span);
 }
 values.sort((a,b)=>a-b);return values.length?values[Math.floor(values.length/2)]:null;
}
export function sizeDistance(size,reference,fallback,minimum=.08){
 if(!size||!reference?.size||!reference?.depth)return fallback;
 return Math.max(minimum,Math.min(4,reference.depth*reference.size/size));
}
