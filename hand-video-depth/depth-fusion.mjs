// Optional map correction uses a frozen reference for each hand. Never infer
// distance from finger curl. Reject stale maps and maps of a previous hand pose.
export class DepthFusion {
 constructor(){this.reset();}
 reset(){this.samples=new Map();this.references=new Map();this.held=new Map();}
 accept(samples,time){for(const s of samples)this.samples.set(s.label,{...s,time});}
 correct(label,base,uv,now,enabled,weight=.25){
  if(!enabled||!(base>0)||!uv||!(weight>0))return base;
  if(!this.held.has(label))this.held.set(label,base);
  const fallback=weight>=1?this.held.get(label):base;
  const s=this.samples.get(label);
  if(!s||now-s.time>2500||s.spread>.25||!(s.meters>.03&&s.meters<20)||Math.hypot(uv[0]-s.uv[0],uv[1]-s.uv[1])>.045)return fallback;
  if(!this.references.has(label))this.references.set(label,{meters:s.meters,base});
  const r=this.references.get(label),target=r.base*s.meters/r.meters;
  if(!Number.isFinite(target)||target<.04||target>4)return fallback;
  this.held.set(label,target);
  const blend=Math.min(1,weight);
  return base*(1-blend)+target*blend;
 }
}
