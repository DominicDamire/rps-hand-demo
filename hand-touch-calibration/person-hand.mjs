// Holistic already associates each hand with a body side. The mask is an
// additional rejection check, not proof of identity or measured depth.
export function acceptPersonHand(lm,pose,mask){
 if(!lm||lm.length!==21||!pose||!mask?.values)return false;
 // Use Holistic's own hand/body association; a second distance gate can
 // reject legitimate close hands when the coarse pose wrist disagrees.
 const {values,width,height}=mask;
 const samples=[0,5,9,13,17].map(i=>{
  const p=lm[i];if(p.x<0||p.x>1||p.y<0||p.y>1)return 0;
  const x=Math.round(p.x*(width-1)),y=Math.round(p.y*(height-1));let best=0;
  for(let yy=Math.max(0,y-2);yy<=Math.min(height-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(width-1,x+2);xx++)best=Math.max(best,values[yy*width+xx]);return best;
 });
 return samples.filter(v=>v>=.3).length>=3;
}
// Approximate adult wrist-to-middle-MCP length; equal for both model hands.
// Fits the palm to camera rays, including relative estimated Z; no scan/history.
export function defaultHandDepth(lm,world,focal,fallback=.5){
 if(!lm?.[17]||!world?.[17])return fallback;
 const ids=[5,9,13,17],root=world[0],length=Math.hypot(world[9].x-root.x,world[9].y-root.y,world[9].z-root.z);
 if(!(length>.01))return fallback;
 const scale=.075/length;let aa=0,ab=0;
 for(const i of ids){const p=world[i],dz=(p.z-root.z)*scale;for(const k of ['x','y']){const a=lm[i][k]-lm[0][k],b=focal[k]*(p[k]-root[k])*scale-(lm[i][k]-.5)*dz;aa+=a*a;ab+=a*b;}}
 const d=ab/aa;return Number.isFinite(d)&&d>.08&&d<3?d:fallback;
}
