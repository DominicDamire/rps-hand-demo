// Adaptive landmark filter: attenuate small noise, pass deliberate movement immediately.
export class LandmarkJitter {
 constructor(){this.last=null;}
 update(lm,world,strength=2,aspect=4/3){
  if(!this.last||strength<=0){this.last={lm:lm.map(p=>({...p})),world:world.map(p=>({...p}))};return this.last;}
  const height=480/aspect;
  for(let i=0;i<lm.length;i++){
   const a=this.last.lm[i],b=this.last.world[i],screen=Math.hypot((lm[i].x-a.x)*480,(lm[i].y-a.y)*height),depth=Math.abs(world[i].z-b.z)*1000;
   const movement=Math.max(screen,depth*.35),fast=Math.max(4,strength*4),t=Math.max(0,Math.min(1,(movement-strength)/(fast-strength))),alpha=.18+.82*t*t*(3-2*t);
   for(const k of ['x','y','z']){a[k]+=(lm[i][k]-a[k])*alpha;b[k]+=(world[i][k]-b[k])*alpha;}
  }return this.last;
 }
}
