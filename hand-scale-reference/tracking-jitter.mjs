// Causal, timestamp-based filtering. No future frames and no contact constraints.
const alpha=(hz,dt)=>1/(1+1/(2*Math.PI*hz*dt));
export class TrackingJitter {
 constructor(){this.reset();}
 reset(){this.tracks=new Map();this.last=null;this.cached=null;}
 filter(packet){
  if(!Number.isFinite(packet.time))return packet;
  if(packet.time===this.last)return this.cached;
  if(this.last!==null&&(packet.time<this.last||packet.time-this.last>300))this.reset();
  const result={...packet,landmarks:[],worldLandmarks:[]};
  for(let h=0;h<(packet.landmarks||[]).length;h++){
   const label=packet.handedness?.[h]?.[0]?.categoryName||String(h);
   for(const field of ['landmarks','worldLandmarks']){
    const points=packet[field]?.[h];if(!points){result[field][h]=points;continue;}
    const key=label+field,old=this.tracks.get(key),dt=old?(packet.time-old.time)/1000:0;
    const next=points.map((p,i)=>{
     const prev=old?.points[i];if(!prev||dt<=0)return {...p,velocity:[0,0,0]};
     const keys=['x','y','z'],vel=keys.map((k,j)=>prev.velocity[j]+alpha(1,dt)*((p[k]-prev[k])/dt-prev.velocity[j]));
     const speed=Math.hypot(...vel),a=alpha(2.5+15*speed,Math.min(.1,dt));
     return {...p,...Object.fromEntries(keys.map(k=>[k,prev[k]+a*(p[k]-prev[k])])),velocity:vel};
    });
    this.tracks.set(key,{time:packet.time,points:next});result[field][h]=next.map(({velocity,...p})=>p);
   }
  }
  this.last=packet.time;this.cached=result;return result;
 }
}
