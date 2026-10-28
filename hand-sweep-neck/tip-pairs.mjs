const tips=[4,8,12,16,20];
export class TipPairs {
 constructor(){this.reset();}
 reset(){this.pairs=[];this.pending=new Map();this.sample=null;}
 update(left,right,aspect,now,cfg){
  if(!cfg.enabled||!left||!right||left.predicted||right.predicted||now-left.seen>250||now-right.seen>250||left.time!==right.time||(left.confidence??1)<.5||(right.confidence??1)<.5){this.reset();return [];}
  if(this.sample===left.landmarks)return this.pairs;this.sample=left.landmarks;
  const distance=(a,b)=>Math.hypot((left.landmarks[a].x-right.landmarks[b].x)*aspect,left.landmarks[a].y-right.landmarks[b].y)*1280;
  const usedL=new Set(),usedR=new Set(),kept=[];
  for(const p of this.pairs)if(distance(p.a,p.b)<=cfg.release){kept.push(p);usedL.add(p.a);usedR.add(p.b);}
  // Maximum-cardinality, minimum-distance assignment: no fingertip can be
  // attracted to two different fingers. Existing contacts retain ownership.
  let best={pairs:[],cost:Infinity};
  function search(i,list,cost){if(i===tips.length){if(list.length>best.pairs.length||list.length===best.pairs.length&&cost<best.cost)best={pairs:list.slice(),cost};return;}
   const a=tips[i];search(i+1,list,cost);if(usedL.has(a))return;
   for(const b of tips)if(!usedR.has(b)){const d=distance(a,b);if(d>cfg.enter)continue;usedR.add(b);list.push({a,b});search(i+1,list,cost+d);list.pop();usedR.delete(b);}
  }
  if(cfg.enter>0)search(0,[],0);
  const active=new Set();for(const p of best.pairs){const key=p.a+':'+p.b;active.add(key);if(!this.pending.has(key))this.pending.set(key,now);if(now-this.pending.get(key)>=cfg.confirm)kept.push(p);}
  for(const key of this.pending.keys())if(!active.has(key))this.pending.delete(key);
  this.pairs=kept;return kept;
 }
}
