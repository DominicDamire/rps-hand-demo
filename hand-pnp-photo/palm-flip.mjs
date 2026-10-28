// Reject discontinuous orientation changes, not gradual turns or quaternion sign changes.
export class PalmFlipGuard {
 constructor(direction=false){this.direction=direction;this.reset();}
 reset(){this.accepted=null;this.seen=-Infinity;this.observation=null;this.rejected=false;}
 update(q,observation,now,threshold=0,staticInput=false){
  if(!(threshold>0)||staticInput){this.reset();return false;}
  if(observation&&observation===this.observation)return this.rejected;
  const gap=now-this.seen;this.seen=now;this.observation=observation;
  const norm=Math.hypot(...q),value=q.map(v=>v/norm);
  if(!Number.isFinite(norm)||norm<1e-8)return this.rejected=!!this.accepted;
  const dot=this.accepted?(this.direction?value.reduce((s,v,i)=>s+v*this.accepted[i],0):Math.abs(value.reduce((s,v,i)=>s+v*this.accepted[i],0))):1;
  const angle=(this.direction?1:2)*Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
  this.rejected=!!this.accepted&&gap<1000&&angle>=threshold;
  if(!this.rejected)this.accepted=value;
  return this.rejected;
 }
}
