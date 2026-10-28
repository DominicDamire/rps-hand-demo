export function fpsMeter(element,names){
 const counts=Object.fromEntries(names.map(n=>[n,0]));let since=performance.now();
 element.style.cssText='white-space:pre-line;color:#9fffc7;background:#00180bd9;padding:7px;border-radius:7px;font:12px/1.5 monospace;pointer-events:none';
 element.textContent=names.map(n=>n+' - FPS').join(' | ');
 const timer=setInterval(()=>{const now=performance.now(),dt=(now-since)/1000;since=now;element.textContent=names.map(n=>{const rate=Math.round(counts[n]/dt);counts[n]=0;return n+' '+rate+' FPS';}).join(' | ');},1000);
 addEventListener('pagehide',()=>clearInterval(timer),{once:true});return name=>{if(name in counts)counts[name]++;};
}
