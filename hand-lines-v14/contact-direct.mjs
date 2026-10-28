export function reach(chain,lengths,target){
 const root=chain[0].clone(),total=lengths.reduce((a,b)=>a+b,0);
 if(root.distanceTo(target)>=total){const d=target.clone().sub(root).normalize();for(let i=1;i<4;i++)chain[i].copy(chain[i-1]).addScaledVector(d,lengths[i-1]);return;}
 for(let pass=0;pass<24;pass++){
  chain[3].copy(target);
  for(let i=2;i>=0;i--){const d=chain[i].clone().sub(chain[i+1]);if(d.lengthSq()<1e-12)d.copy(chain[Math.max(0,i-1)]).sub(chain[i+1]);if(d.lengthSq()<1e-12)d.set(0,1,0);chain[i].copy(chain[i+1]).addScaledVector(d.normalize(),lengths[i]);}
  chain[0].copy(root);
  for(let i=1;i<4;i++){const d=chain[i].clone().sub(chain[i-1]);if(d.lengthSq()<1e-12)d.set(0,1,0);chain[i].copy(chain[i-1]).addScaledVector(d.normalize(),lengths[i-1]);}
  if(chain[3].distanceTo(target)<1e-5)break;
 }
}

// Solve contact inside the finger's allowed plane, after its hinge constraints.
export function fitContact(thumb,finger,thumbLengths,fingerLengths,hinge){
 reach(thumb,thumbLengths,finger[3]);
 for(let pass=0;pass<24&&thumb[3].distanceTo(finger[3])>.0002;pass++){
  const target=thumb[3].clone().add(finger[3]).multiplyScalar(.5);
  if(hinge)target.addScaledVector(hinge,-target.clone().sub(finger[0]).dot(hinge));
  reach(finger,fingerLengths,target);reach(thumb,thumbLengths,finger[3]);
 }
 return thumb[3].distanceTo(finger[3]);
}

export class ContactLatch{
 constructor(){this.contact=null;this.pending=null;this.misses=0;this.observation=null;}
 update(observation,lm,width,height,enabled,palmFraction=.12,confirm=true){
  if(!enabled){this.contact=null;this.pending=null;this.misses=0;this.observation=null;return null;}
  if(observation===this.observation)return this.contact;this.observation=observation;
  const palm=Math.hypot((lm[5].x-lm[17].x)*width,(lm[5].y-lm[17].y)*height),enter=Math.max(8,palm*palmFraction);
  const point=i=>[lm[i].x*width,lm[i].y*height],tail=i=>point(i).map((v,k)=>v*.6+point(i-1)[k]*.4);
  const distance=i=>{
   const a=point(4),b=point(i),tipDistance=Math.hypot(a[0]-b[0],a[1]-b[1]);
   // Touch can be pad-to-tip: inspect only the outer part of each distal segment.
   // Keep an endpoint bound so crossing fingers or a tucked thumb do not snap.
   if(tipDistance>Math.max(enter*2.4,palm*.45))return tipDistance;
   return Math.min(tipDistance,segmentDistance(tail(4),a,tail(i),b));
  };
  if(this.contact){if(distance(this.contact)>enter*1.6){if(++this.misses>=2){this.contact=null;this.pending=null;}}else this.misses=0;}
  if(!this.contact){const candidate=[8,12,16,20].sort((a,b)=>distance(a)-distance(b))[0];if(distance(candidate)<=enter){if(!confirm||this.pending===candidate){this.contact=candidate;this.misses=0;}else this.pending=candidate;}else this.pending=null;}
  return this.contact;
 }
}

function segmentDistance(a,b,c,d){
 const cross=(x,y)=>x[0]*y[1]-x[1]*y[0],sub=(x,y)=>x.map((v,k)=>v-y[k]);
 const u=sub(b,a),v=sub(d,c),offset=sub(c,a),den=cross(u,v);
 if(Math.abs(den)>1e-9){const t=cross(offset,v)/den,s=cross(offset,u)/den;if(t>=0&&t<=1&&s>=0&&s<=1)return 0;}
 const distance=(p,x,y)=>{const r=sub(y,x),length=r[0]**2+r[1]**2,t=length?Math.max(0,Math.min(1,((p[0]-x[0])*r[0]+(p[1]-x[1])*r[1])/length)):0;return Math.hypot(p[0]-x[0]-t*r[0],p[1]-x[1]-t*r[1]);};
 return Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b));
}
