// Preserve identity using palm motion rather than a single handedness label.
const ids=[0,5,9,13,17];
const distance=(a,b)=>ids.reduce((s,i)=>s+Math.hypot(a[i].x-b[i].x,a[i].y-b[i].y),0)/ids.length;
export function stableHands(current,recent,now,grace,predict=true,blend=false){
 const previous=[...recent.values()].filter(h=>now-h.seen<Math.min(grace,350));
 const edges=[];current.forEach((h,i)=>previous.forEach(p=>{const d=distance(h.landmarks,p.landmarks);if(d<.18)edges.push({i,p,d});}));
 edges.sort((a,b)=>a.d-b.d);const assigned=new Set(),labels=new Set();
 for(const {i,p} of edges)if(!assigned.has(i)&&!labels.has(p.label)){current[i]={...current[i],label:p.label};assigned.add(i);labels.add(p.label);}
 const unique=[];
 for(const i of current.map((_,i)=>i).sort((a,b)=>Number(assigned.has(b))-Number(assigned.has(a)))){let h=current[i];if(unique.some(p=>distance(h.landmarks,p.landmarks)<.025))continue;
  if(!assigned.has(i)&&labels.has(h.label))h={...h,label:h.label==='Left'?'Right':'Left'};
  if(unique.some(p=>p.label===h.label))continue;labels.add(h.label);unique.push(h);
 }
 for(const h of unique){const old=recent.get(h.label),dt=old?h.seen-old.seen:0;
  h.velocity=dt>=8&&dt<=200?{x:(h.landmarks[0].x-old.landmarks[0].x)/dt,y:(h.landmarks[0].y-old.landmarks[0].y)/dt}:{x:0,y:0};
  if(blend&&old){
   if(old.missing){const estimate=predictHand(old,now);h.recovery={at:now,dx:estimate.landmarks[0].x-h.landmarks[0].x,dy:estimate.landmarks[0].y-h.landmarks[0].y};}
   else if(old.recovery&&now-old.recovery.at<100)h.recovery=old.recovery;
  }
  recent.set(h.label,h);
 }
 for(const [label,h]of recent){if(now-h.seen>grace){recent.delete(label);continue;}
  if(!unique.some(p=>p.label===label)&&!unique.some(p=>distance(p.landmarks,h.landmarks)<.18)){h.missing=true;unique.push(predict?predictHand(h,now):{...h,predicted:true});}
 }
 return unique.slice(0,2).map(h=>{if(!blend||h.predicted||!h.recovery)return h;const w=Math.max(0,1-(now-h.recovery.at)/100);return {...h,landmarks:h.landmarks.map(p=>({...p,x:p.x+h.recovery.dx*w,y:p.y+h.recovery.dy*w}))};});
}

export function predictHand(h,now){
 // Translation only: no invented finger articulation or depth. Decelerate to
 // rest over 150ms and never extend the original observation timestamp.
 const elapsed=Math.min(150,Math.max(0,now-h.seen)),t=elapsed-elapsed*elapsed/300;
 let dx=(h.velocity?.x??0)*t,dy=(h.velocity?.y??0)*t;
 const scale=Math.min(1,.03/Math.max(1e-9,Math.hypot(dx,dy)));dx*=scale;dy*=scale;
 return {...h,predicted:true,landmarks:h.landmarks.map(p=>({...p,x:p.x+dx,y:p.y+dy}))};
}
