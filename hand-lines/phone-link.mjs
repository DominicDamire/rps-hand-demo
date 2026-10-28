// Cross-device link: the phone runs hand tracking and sends landmark numbers.
// This avoids peer-to-peer video, which commonly fails across NATs and guest Wi-Fi.
import {connectLink,packHands,unpackHands} from '../movement/link.mjs?v=91';

const validCode=code=>/^\d{6}$/.test(code);
const newCode=()=>String(100000+Math.floor(Math.random()*900000));
const payloadText=payload=>typeof payload==='string'?payload:new TextDecoder().decode(payload);

export function receivePhone(onResult,onStatus,onEnd){
 if(!window.QRCode)throw Error('QR library could not load. Reload and try again.');
 const id=newCode();let link=null,closed=false,connected=false,heartbeat=null,size={w:640,h:480};
 const box=document.createElement('dialog');box.className='phonePair';
 box.innerHTML='<h2>Use your phone camera</h2><p>Scan this QR on the other phone, then tap <b>Start camera</b>.<br>Different Wi-Fi or mobile data is supported.</p><div class="qr"></div><p class="code"></p><p><a target="_blank" rel="noopener">Open phone camera page</a></p><div class="row"><button type="button" data-copy>Copy phone link</button><button type="button" data-cancel>Cancel</button></div><p class="pairStatus" role="status">Connecting PC to relay…</p>';
 const url=new URL('camera.html',import.meta.url);url.searchParams.set('pair',id);
 box.querySelector('a').href=url.href;box.querySelector('.code').textContent='Pairing code: '+id;
 new QRCode(box.querySelector('.qr'),{text:url.href,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});
 const status=text=>{if(closed||(connected&&/^relay connected/.test(text)))return;const el=box.querySelector('.pairStatus');if(el)el.textContent=text;onStatus(text);};
 const close=()=>{if(closed)return;closed=true;clearInterval(heartbeat);link?.close();if(box.open)box.close();box.remove();};
 const cancel=()=>{close();onEnd('Phone connection cancelled');};
 box.querySelector('[data-cancel]').onclick=cancel;
 box.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(url.href);status('Phone link copied. Open it on the other phone.');}catch{status('Copy was blocked. Open the phone camera link and copy its address.');}};
 box.oncancel=e=>{e.preventDefault();cancel();};document.body.append(box);box.showModal();
 connectLink(id,{onStatus:status,onMessage:(kind,payload)=>{
  if(closed)return;
  try{
   if(kind==='p'){const data=JSON.parse(payloadText(payload));if(data.w>0&&data.h>0)size={w:data.w,h:data.h};if(data.error)status('Phone error: '+data.error);else if(data.stage==='linked')status('Phone found. Waiting for camera permission…');else if(data.stage==='camera')status('Phone camera open. Loading hand tracker…');else if(data.stage==='tracking')status('Phone tracker ready. Show a hand…');return;}
   if(kind!=='h')return;
   const bytes=payload instanceof Uint8Array?payload:new Uint8Array(payload),data=unpackHands(bytes);
   data.type='result';data.inferenceMs=0;data.time=performance.now()-8;
   if(!connected){connected=true;if(box.open)box.close();onStatus('Phone connected');}
   onResult(data,size);
  }catch(error){status('Could not read phone tracking: '+error.message);}
 }}).then(value=>{if(closed)value.close();else{link=value;status('PC ready. Waiting for phone '+id+'…');const ping=()=>link?.sendJSON('c',{kind:'ping',time:Date.now()});ping();heartbeat=setInterval(ping,1500);}}).catch(error=>status('Connection failed: '+error.message));
 return close;
}

export async function sendPhone(id,video,status,facing='user'){
 if(!validCode(id))throw Error('Scan a fresh QR code from the PC lab.');
 let link=null,stream=null,worker=null,wake=null,stopped=false,busy=false,lastVideo=-1,frames=0,since=performance.now(),fps=0,stage='linked';
 const capture=document.createElement('canvas'),captureContext=capture.getContext('2d',{willReadFrequently:true});
 const stop=()=>{if(stopped)return;stopped=true;worker?.terminate();link?.close();stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;wake?.release().catch(()=>{});};
 try{
  status('Connecting phone to PC '+id+'…');
  link=await connectLink(id,{onStatus:status,subscribeTo:'c',onMessage:(kind)=>{if(kind==='c')link?.sendJSON('p',{stage,w:video.videoWidth||0,h:video.videoHeight||0,fps});}});
  link.sendJSON('p',{stage:'linked'});
  status('Phone linked. Opening camera…');
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}}});
  video.srcObject=stream;video.muted=true;await video.play();
  stage='camera';link.sendJSON('p',{stage,w:video.videoWidth,h:video.videoHeight});
  navigator.wakeLock?.request('screen').then(lock=>{if(stopped)lock.release();else wake=lock;}).catch(()=>{});
  status('Camera open. Loading hand tracking…');
  worker=new Worker(new URL('../movement/tracker.mjs?v=91',import.meta.url),{type:'module'});
  worker.onerror=event=>{busy=false;status('Hand tracker error: '+(event.message||'unknown error'));};
  worker.onmessage=({data})=>{
   if(data.type==='ready'){stage='tracking';link.sendJSON('p',{stage,w:video.videoWidth,h:video.videoHeight});status('Tracking ready. Keep this page open and show your hand.');return;}
   if(data.type==='error'){busy=false;status('Hand tracker error: '+data.message);return;}
   if(data.type!=='result')return;busy=false;frames++;link.send('h',packHands(data));
  };
  worker.postMessage({type:'init'});
  const loop=async()=>{
   if(stopped)return;requestAnimationFrame(loop);const now=performance.now();
   if(now-since>=1000){fps=Math.round(frames*1000/(now-since));frames=0;since=now;link.sendJSON('p',{w:video.videoWidth,h:video.videoHeight,fps});status('Streaming hand tracking to PC '+id+' · '+fps+' fps');}
   if(busy||!video.videoWidth||document.hidden||video.currentTime===lastVideo)return;
   try{
    busy=true;lastVideo=video.currentTime;const height=Math.max(1,Math.round(480*video.videoHeight/video.videoWidth));let bitmap;
    if(typeof createImageBitmap==='function')try{bitmap=await createImageBitmap(video,{resizeWidth:480,resizeHeight:height,resizeQuality:'low'});}catch{}
    if(bitmap)worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap]);
    else{capture.width=480;capture.height=height;captureContext.drawImage(video,0,0,480,height);const image=captureContext.getImageData(0,0,480,height);worker.postMessage({type:'frame',image,time:performance.now()},[image.data.buffer]);}
   }catch(error){busy=false;status('Camera frame error: '+error.message);link.sendJSON('p',{stage,error:'Camera frame failed: '+error.message});}
  };
  requestAnimationFrame(loop);return stop;
 }catch(error){link?.sendJSON('p',{stage,error:error.message});await new Promise(resolve=>setTimeout(resolve,150));stop();throw error;}
}
