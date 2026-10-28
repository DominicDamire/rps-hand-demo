// Use observations nearest the endpoints, not long moving averages.
export function sweepEndpoints(samples){
 const before=samples.filter(s=>s.elapsed<0&&s.elapsed>=-1000);
 const early=before.length>=3?before.slice(-5):samples.filter(s=>s.elapsed>=0&&s.elapsed<1000).slice(0,5);
 const late=samples.filter(s=>s.elapsed>=7000).slice(-5);
 return {early,late};
}
export class OneHandSweep {
 constructor(){this.cancel();}
 cancel(){this.started=null;this.samples=[];this.label=null;this.last=null;this.rejected={};}
 begin(now){this.cancel();this.started=now;}
 update(now,hands,face){
  if(this.started===null)return null;
  const elapsed=now-this.started-5000;
  if(elapsed>=8000){
   const samples=this.samples,{early,late}=sweepEndpoints(samples),count=samples.filter(s=>s.elapsed>=0).length;
   const reasons=Object.entries(this.rejected).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([why,n])=>why+' ('+n+' checks)').join('; ');
   const ok=count>=12&&early.length>=3&&late.length>=3;
   this.cancel();
   return {done:true,progress:8,...(ok?{samples}:{}),message:ok?'Sweep recorded.':'Sweep finished: '+count+' motion frames; start '+early.length+'/3, neck '+late.length+'/3. '+(reasons||'Missing endpoint observations.')+' Previous capture kept.'};
  }
  let reason='',h=hands.find(h=>(!this.label||h.label===this.label)&&now-h.seen<350);
  const inside=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-.04&&p.x<=1.04&&p.y>=-.04&&p.y<=1.04;
  if(!h)reason=this.label&&hands.length?'Selected hand lost or label changed':'No fresh hand result';
  else if(h.confidence<.5)reason='Hand label uncertain';
  else if(h.landmarks?.length!==21||!h.landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))reason='Incomplete hand landmarks';
  else if(![0,5,9,13,17].every(i=>inside(h.landmarks[i]))||h.landmarks.filter(inside).length<17)reason='Palm outside camera frame';
  else if(h.time===this.last)reason='Waiting for next hand frame';
  else if(elapsed>=-1000){this.label=h.label;this.last=h.time;this.samples.push({elapsed,label:h.label,landmarks:h.landmarks.map(p=>({...p})),world:h.world?.map(p=>({...p})),points:h.points?.map(p=>[...p]),focal:h.focal,aspect:h.aspect,face});}
  if(elapsed<0)return {message:'Starting in '+Math.ceil(-elapsed/1000)+' — hold one extended open hand still, palm facing you. '+(reason||'Start reference ready. Keep your face visible.'),progress:0};
  if(reason)this.rejected[reason]=(this.rejected[reason]||0)+1;
  const count=this.samples.filter(s=>s.elapsed>=0).length;
  return {progress:elapsed/1000,message:'Recording '+(elapsed/1000).toFixed(1)+'/8.0 s — move your open hand back toward your shoulder/neck. One way only. '+count+' frames accepted. '+(reason||(!face?'Face briefly lost; hand recording continues.':elapsed>=7000?'Hold at your neck, with the hand and face visible.':'Tracking hand.'))};
 }
}
