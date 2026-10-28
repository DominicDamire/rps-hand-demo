import {DepthFusion} from './depth-fusion.mjs?v=vda2';
import {depthFrameSize} from './frame-size.mjs?v=vda2';
export function installDepthMap({getSource,getHands,getSourceLabel=()=>"Camera video",connectPhone=()=>{}}){
 const panel=document.createElement('section');panel.id='videoDepthPanel';
 panel.style.cssText='padding:12px;background:#101820;border:1px solid #49687d;margin:10px 0';
 panel.innerHTML=`<h2>Video Depth Anything · separate experiment</h2><label>Depth processor <select id="depthDevice"><option value="gpu" selected>GPU</option><option value="cpu">CPU</option></select></label> <label>Depth quality <select id="depthQuality"><option value="168">Fast · 168</option><option value="224" selected>Balanced · 224</option><option value="336">Detailed · 336</option></select></label><button id="depthPhone">Connect iPhone / phone · QR</button> <button id="depthStart">Start depth map</button> <button id="depthStop" disabled>Stop depth map</button><label style="display:block;margin:10px 0"><input id="depthUse" type="checkbox"> Use depth map to help hand depth</label><label style="display:block">Depth-map contribution (%)<input id="depthRatio" type="range" min="0" max="100" step="1" value="25"><output id="depthRatioValue">25% map / 75% palm</output></label><p>0% uses palm depth; 100% uses anchored map depth. At 100%, missing or unreliable maps hold the last map depth; below 100%, they fall back to palm depth. Sweep boundaries and enabled collision/contact corrections still apply.</p><p id="depthStatus" role="status">Connect your iPhone using QR on this page, then start the map. No PC webcam is needed. The PC depth engine is required.</p><img id="depthImage" alt="Estimated depth map" hidden style="max-width:100%;max-height:300px"><p id="depthSamples"></p><p>Preview only by default. Red/yellow is nearer; blue is farther. Colours rescale per frame. Distances are model estimates. Optional correction uses a frozen reference, rejects stale or unreliable estimates, and pauses during sweep calibration.</p><a href="http://127.0.0.1:8788/hand-video-depth/?v=vda1" target="_blank">Open direct PC preview</a> · <a href="./setup.html" target="_blank">PC engine setup and limitations</a>`;
 document.querySelector('.workspace').prepend(panel);
 const el=id=>panel.querySelector('#'+id),fusion=new DepthFusion(),canvas=document.createElement('canvas');
 let active=false,timer=null,abort=null,session='',lastSource=null,lastDone=0,generation=0;
 function reset(){fusion.reset();session=crypto.randomUUID();}
 function stop(){generation++;active=false;clearTimeout(timer);abort?.abort();reset();el('depthStart').disabled=false;el('depthStop').disabled=true;el('depthStatus').textContent='Depth map stopped. Sweep/palm tracking continues.';}
 async function step(){
  if(!active)return;const run=generation;
  const source=getSource(),w=source?.videoWidth||source?.naturalWidth||source?.width,h=source?.videoHeight||source?.naturalHeight||source?.height;
  if(!w||!h){el('depthStatus').textContent='No video connected. Click Connect iPhone / phone · QR here, scan it, and start the camera on your phone. This button does not open the PC webcam.';timer=setTimeout(step,500);return;}
  if(source!==lastSource){lastSource=source;reset();}
  const captured=performance.now(),requestSession=session,regions=getHands().filter(h=>!source.videoWidth||captured-h.seen<250).map(h=>({label:h.label,polygon:[0,5,9,13,17].map(i=>[h.landmarks[i].x,h.landmarks[i].y])}));
  const dimensions=depthFrameSize(w,h);if(!dimensions){timer=setTimeout(step,500);return;}
  canvas.width=dimensions.width;canvas.height=dimensions.height;canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
  abort=new AbortController();const requestAbort=abort;const timeout=setTimeout(()=>requestAbort.abort(),60000);
  try{
   const response=await fetch('http://127.0.0.1:8788/infer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:session,device:el('depthDevice').value,inputSize:+el('depthQuality').value,image:canvas.toDataURL('image/jpeg',.8).split(',')[1],regions}),signal:abort.signal});
   const data=await response.json();if(!response.ok){const error=new Error(data.error||response.status);error.server=true;throw error;}
   if(!active||run!==generation||session!==requestSession)return;const now=performance.now(),fps=lastDone?1000/(now-lastDone):1000/(now-captured);lastDone=now;
   fusion.accept(data.samples,captured);el('depthImage').src='data:image/jpeg;base64,'+data.image;el('depthImage').hidden=false;
   el('depthStatus').textContent=`Source: ${getSourceLabel()} · Depth: ${fps.toFixed(2)} updates/s · inference ${Math.round(data.ms)} ms · map age ${Math.round(now-captured)} ms · ${data.device}. Camera and hand FPS are separate.`;
   el('depthSamples').textContent=data.samples.length?data.samples.map(s=>`${s.label} palm: ${s.meters.toFixed(2)} m estimated`).join(' · '):'No fresh palm region to sample. Map preview is still available.';
  }catch(e){if(active&&run===generation){el('depthStatus').textContent=e.server?'Depth engine rejected the frame: '+e.message+'. Connection to the engine is working. Palm tracking continues.':'Depth unavailable: '+e.message+'. Start the PC engine; allow local-network access if the browser asks, or use Open direct PC preview. Palm tracking continues.';}}
  finally{clearTimeout(timeout);if(active&&run===generation)timer=setTimeout(step,0);}
 }
 for(const id of ['depthDevice','depthQuality'])el(id).onchange=reset;
 el('depthRatio').oninput=()=>{const v=+el('depthRatio').value;el('depthRatioValue').textContent=v+'% map / '+(100-v)+'% palm';};
 el('depthPhone').onclick=connectPhone;
 el('depthStart').onclick=()=>{generation++;active=true;reset();lastDone=0;el('depthStart').disabled=true;el('depthStop').disabled=false;el('depthStatus').textContent='Reading the connected video source…';step();};
 el('depthStop').onclick=stop;el('depthUse').onchange=()=>fusion.reset();window.addEventListener('pagehide',stop);
 return {stop,reset,correct:(label,base,lm,now)=>{const uv=[0,5,9,13,17].reduce((a,i)=>[a[0]+lm[i].x/5,a[1]+lm[i].y/5],[0,0]);return fusion.correct(label,base,uv,now,active&&el('depthUse').checked,+el('depthRatio').value/100);}};
}
