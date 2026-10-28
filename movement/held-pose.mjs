export const DIRECTIONS={forward:[0,-1],left:[-1,0],right:[1,0],backward:[0,1]};
export function poseFeature(p){
 if(p?.length!==21||!p.every(v=>[v.x,v.y,v.z].every(Number.isFinite)))return null;
 const dist=(a,b)=>Math.hypot(p[a].x-p[b].x,p[a].y-p[b].y,p[a].z-p[b].z);
 const scale=(dist(0,9)+dist(5,17))/2;
 if(scale<.005)return null;
 const reach=m=>dist(m,m+3)/(dist(m,m+1)+dist(m+1,m+2)+dist(m+2,m+3)||1);
 // All reference poses curl the four fingers. An open hand is an explicit stop.
 if([5,9,13,17].filter(m=>reach(m)>.8).length>=2)return null;
 return p.slice(1).flatMap((v,i)=>{const weight=i<4?2:1;return [(v.x-p[0].x)/scale*weight,(v.y-p[0].y)/scale*weight,(v.z-p[0].z)/scale*weight];});
}
export const poseDistance=(a,b)=>Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)/a.length);
export class HeldPose {
 constructor(){this.templates={};this.speed=3;this.reset();}
 reset(){this.direction=null;this.candidate=null;this.count=0;this.seen=-Infinity;this.reason='NO THUMB POSE';}
 get ready(){return Object.keys(DIRECTIONS).every(k=>this.templates[k]?.length===60);}
 load(value){if(value)for(const k of Object.keys(DIRECTIONS)){if(value[k]?.length===60&&value[k].every(Number.isFinite))this.templates[k]=value[k];}}
 learn(direction,samples){
  if(!DIRECTIONS[direction]||samples.length<8)return 'Keep the pose visible a little longer.';
  const mean=samples[0].map((_,i)=>samples.reduce((s,p)=>s+p[i],0)/samples.length);
  if(samples.some(p=>poseDistance(p,mean)>.2))return 'Hand moved during setup. Hold the pose still and retry.';
  if(Object.entries(this.templates).some(([k,p])=>k!==direction&&poseDistance(p,mean)<.14))return 'Too similar to another direction. Make the poses more distinct and retry.';
  this.templates[direction]=mean;this.reset();return null;
 }
 receive(feature,time){
  if(!this.ready||!feature){this.reset();this.reason=!this.ready?'NO REFERENCES':'OPEN HAND / LANDMARKS UNCLEAR';return;}
  const ranked=Object.entries(this.templates).map(([k,p])=>[k,poseDistance(p,feature)]).sort((a,b)=>a[1]-b[1]);
  const [best,distance]=ranked[0];
  if(distance>.28||ranked[1][1]-distance<.045){this.reset();this.reason=distance>.28?'POSE DOES NOT MATCH PHOTOS':'BETWEEN TWO DIRECTIONS';return;}
  this.seen=time;
  if(best!==this.candidate){this.direction=null;this.candidate=best;this.count=1;}else this.count++;
  if(this.count>=2){this.direction=best;this.reason='MOVING';}else this.reason='CONFIRMING '+best.toUpperCase();
 }
 step(now,dt){
  if(now-this.seen>350){this.reset();return {dx:0,dz:0};}
  const [x,z]=DIRECTIONS[this.direction]??[0,0],distance=this.speed*Math.max(0,Math.min(.05,dt));
  return {dx:x*distance,dz:z*distance};
 }
}
