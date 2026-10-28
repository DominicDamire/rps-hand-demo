// Validate a fully open frontal reference without using it as a live pose override.
export function frontReference(hand,aspect=1){
 if(!hand||!Number.isFinite(hand.confidence)||hand.confidence<.7)return {error:'Show one clearly tracked hand.'};
 const p=hand.landmarks,w=hand.world;
 if(p?.length!==21||w?.length!==21||p.some(v=>![v.x,v.y].every(Number.isFinite)||v.x<.02||v.x>.98||v.y<.02||v.y>.98))return {error:'Keep the complete hand inside the picture.'};
 if(w.some(v=>![v.x,v.y,v.z].every(Number.isFinite)))return {error:'Wait for a complete 3D hand estimate.'};
 const sub=(a,b)=>[a.x-b.x,a.y-b.y,a.z-b.z],length=a=>Math.hypot(...a),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const n=cross(sub(w[5],w[17]),sub(w[9],w[0]));if(length(n)<1e-10||Math.abs(n[2])/length(n)<.88)return {error:'Face the palm squarely toward the camera.'};
 for(const base of [5,9,13,17]){const segments=[0,1,2].map(k=>sub(w[base+k+1],w[base+k]));if(length(sub(w[base+3],w[base]))/segments.reduce((s,v)=>s+length(v),0)<.92||segments.reduce((s,v)=>s+length(v),0)<1e-8)return {error:'Straighten all four fingers and spread them comfortably.'};}
 const xy=p.map(v=>[v.x*aspect,v.y]),vx=xy[9][0]-xy[0][0],vy=xy[0][1]-xy[9][1],span=Math.hypot(vx,vy);if(span<.08)return {error:'Bring the open hand closer to the camera.'};
 const ex=-vy/span,ey=vx/span,sign=((xy[5][0]-xy[0][0])*ex+(xy[0][1]-xy[5][1])*ey)<0?-1:1;
 // Canonical image convention: index on the left, wrist-to-middle vertical.
 const points=xy.map(v=>{const x=v[0]-xy[0][0],y=xy[0][1]-v[1];return [-sign*(x*ex+y*ey)/span,-(x*vx+y*vy)/(span*span)];});
 return {points};
}
export class FrontCapture{
 reset(){this.samples=[];this.start=null;this.time=null;this.label=null;}
 constructor(){this.reset();}
 update(hand,aspect,now){const ref=frontReference(hand,aspect);if(ref.error){this.reset();return ref;}
 if(this.label&&this.label!==hand.label){this.reset();return {error:'Keep the same hand visible.'};}
 if(hand.time===this.time)return {progress:this.start===null?0:Math.min(1,(now-this.start)/1500)};
 if(this.samples.length&&Math.max(...ref.points.map((p,i)=>Math.hypot(p[0]-this.samples[0][i][0],p[1]-this.samples[0][i][1])))>.09){this.reset();return {error:'Hold the open pose steady.'};}
 this.start??=now;this.label=hand.label;this.time=hand.time;this.samples.push(ref.points);
 const progress=Math.min(1,(now-this.start)/1500);if(progress<1||this.samples.length<12)return {progress};
 const points=ref.points.map((_,i)=>[0,1].map(k=>this.samples.reduce((sum,s)=>sum+s[i][k],0)/this.samples.length));return {progress:1,points};
 }
}
