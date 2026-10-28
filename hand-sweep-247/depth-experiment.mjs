// Absolute camera distance is unavailable from hand-local world coordinates.
// Estimate it from metric palm span / projected span, with assumed 60-degree FOV.
export function metricPalmDepth(lm,world,aspect,fallback=.4){
 const samples=[];
 for(const i of [5,9,13,17]){
  const screen=Math.hypot((lm[i].x-lm[0].x)*aspect,lm[i].y-lm[0].y);
  const metric=Math.hypot(world[i].x-world[0].x,world[i].y-world[0].y);
  const d=metric/(2*Math.tan(Math.PI/6)*screen);
  if(screen>.01&&Number.isFinite(d)&&d>.05&&d<4)samples.push(d);
 }
 samples.sort((a,b)=>a-b);return samples.length?samples[Math.floor(samples.length/2)]:fallback;
}
