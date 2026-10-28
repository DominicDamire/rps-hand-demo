// A small deadband, not temporal smoothing: accepted motion is copied immediately.
export class LandmarkNoise {
 constructor(){this.previous=null;}
 update(lm,world){
 const next={lm:lm.map(p=>({...p})),world:world.map(p=>({...p}))};
 if(this.previous)for(let i=0;i<lm.length;i++){
 const old=this.previous.lm[i],w=this.previous.world[i];
 if(Math.hypot(lm[i].x-old.x,lm[i].y-old.y)<.0015) {next.lm[i].x=old.x;next.lm[i].y=old.y;}
 for(const k of ['x','y','z'])if(Math.abs(world[i][k]-w[k])<.001)next.world[i][k]=w[k];
 }
 this.previous=next;return next;
 }
}
