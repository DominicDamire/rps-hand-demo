import {drawFace,drawShoulders,drawUpperBody,encodeAux,decodeAux} from './face-overlay.mjs?v=demo9';
import {startTracking,defaults} from './tracking-session.mjs?v=demo9';
// Cross-device link: the phone runs hand tracking and sends landmark numbers.
// This avoids peer-to-peer video, which commonly fails across NATs and guest Wi-Fi.
import {connectLink,packHands,unpackHands} from '../movement/link.mjs?v=91';

const validCode=code=>/^\d{6}$/.test(code);
const newCode=()=>String(100000+Math.floor(Math.random()*900000));
const payloadText=payload=>typeof payload==='string'?payload:new TextDecoder().decode(payload);

export function receivePhone(onResult,onStatus,onEnd,onAux=()=>{},getOptions=()=>defaults,onStats=()=>{}){
 if(!window.QRCode)throw Error('QR library could not load. Reload and try again.');
 const id=newCode();let link=null,closed=false,connected=false,heartbeat=null,size={w:640,h:480},trackerDetail='';
 const box=document.createElement('dialog');box.className='phonePair';
 box.innerHTML='<h2>Use your phone camera</h2><p>Scan this QR on the other phone, then tap <b>Start camera</b>.<br>Different Wi-Fi or mobile data is supported.</p><div class="qr"></div><p class="code"></p><p><a target="_blank" rel="noopener">Open phone camera page</a></p><div class="row"><button type="button" data-copy>Copy phone link</button><button type="button" data-cancel>Cancel</button></div><p class="pairStatus" role="status">Connecting PC to relay…</p>';
 const url=new URL('camera.html',import.meta.url);url.searchParams.set('pair',id);url.searchParams.set('v','demo9');if(getOptions().fullBody)url.searchParams.set('body','1');
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
   if(kind==='p'){const data=JSON.parse(payloadText(payload));if(data.w>0&&data.h>0)size={w:data.w,h:data.h};if(data.error)status('Phone error: '+data.error);else if(data.stage==='linked')status('Phone found. Waiting for camera permission…');else if(data.stage==='camera')status(trackerDetail||'Phone camera open. Loading hands, face and shoulders…');else if(data.stage==='tracking')status(getOptions().fullBody?'Phone tracker ready. Show your upper body…':'Phone tracker ready. Show a hand…');return;}
   if(kind==='a'){if(!connected){connected=true;if(box.open)box.close();onStatus(getOptions().fullBody?'Phone connected: head and full upper body':'Phone connected: face and shoulders');}onAux(decodeAux(JSON.parse(payloadText(payload))),size);return;}if(kind==='s'){const metrics=JSON.parse(payloadText(payload));onStats(metrics);if(!connected){const errors=Object.values(metrics.errors||{});trackerDetail=errors.length?'Phone tracker error: '+errors.join(' · '):metrics.camera>0?'Phone sending '+metrics.camera+' camera FPS. Initializing tracking…':'Phone camera opened, but no new frames are arriving. Keep its camera page visible.';status(trackerDetail);}return;}if(kind!=='h')return;
   const bytes=payload instanceof Uint8Array?payload:new Uint8Array(payload),data=unpackHands(bytes);
   data.type='result';data.inferenceMs=0;data.time=performance.now()-8;
   if(!connected){connected=true;if(box.open)box.close();onStatus('Phone connected');}
   onResult(data,size);
  }catch(error){status('Could not read phone tracking: '+error.message);}
 }}).then(value=>{if(closed)value.close();else{link=value;status('PC ready. Waiting for phone '+id+'…');const ping=()=>link?.sendJSON('c',{kind:'ping',time:Date.now(),settings:getOptions()});ping();heartbeat=setInterval(ping,1500);}}).catch(error=>status('Connection failed: '+error.message));
 return close;
}


export async function sendPhone(id,video,status,facing='user'){
 if(!validCode(id))throw Error('Scan a fresh QR code from the PC lab.');
 let link=null,stream=null,session=null,wake=null,stopped=false,stage='linked',settings={...defaults};
 const overlay=document.createElement('canvas');overlay.style.cssText='width:100%;max-width:640px;display:block;margin:auto;background:#05080c';video.after(overlay);video.hidden=false;video.style.cssText='display:block;width:100%;max-height:none;margin:0;transform:scaleX(-1)';
 const badge=document.createElement('div');badge.style.cssText='position:absolute;top:8px;right:8px;color:#96ffd1;background:#000c;padding:7px;border-radius:6px;font:12px monospace;white-space:pre;pointer-events:none';const wrap=document.createElement('div');wrap.style.cssText='position:relative;max-width:640px;margin:auto';video.before(wrap);wrap.append(video,overlay,badge);overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;background:transparent';badge.textContent='CAM — FPS';
 let receivedSettings=false;
 if(new URLSearchParams(location.search).get('body')==='1')settings={...settings,fullBody:true,handRate:0,faceRate:0};
 const recent={hands:null,face:null,pose:null};
 const paint=(source)=>{overlay.width=source.width;overlay.height=source.height;const c=overlay.getContext('2d'),w=overlay.width,h=overlay.height;c.clearRect(0,0,w,h);
  const seg=(a,b,color)=>{c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.moveTo((1-a.x)*w,a.y*h);c.lineTo((1-b.x)*w,b.y*h);c.stroke();};
  for(const lm of settings.overlayRate>0?(recent.hands?.landmarks||[]):[])for(let f=0;f<5;f++){let prev=0;for(let i=1;i<=4;i++){const j=4*f+i;seg(lm[prev],lm[j],'#8ee3bf');prev=j;}}
  if(settings.overlayRate>0){for(const lm of recent.hands?.landmarks||[]){c.fillStyle='#effff5';for(const p of lm){c.beginPath();c.arc((1-p.x)*w,p.y*h,2.5,0,Math.PI*2);c.fill();}}if(recent.face?.face)drawFace(c,recent.face.face.points,w,h,recent.face.face.matrix);}
  if(settings.overlayRate>0&&recent.pose?.pose){if(settings.fullBody)drawUpperBody(c,recent.pose.pose,w,h);else drawShoulders(c,recent.pose.pose,recent.face?.face,w,h);}
 };
 const stop=()=>{if(stopped)return;stopped=true;session?.();link?.close();stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;video.style.cssText='';wrap.before(video);wrap.remove();wake?.release().catch(()=>{});};
 try{
  link=await connectLink(id,{onStatus:status,subscribeTo:'c',onMessage:(kind,payload)=>{if(kind==='c'){try{const msg=JSON.parse(payloadText(payload));if(msg.settings){receivedSettings=true;for(const k of Object.keys(defaults)){const v=msg.settings[k];if(['handPriority','uncappedTracking','fullBody'].includes(k)&&typeof v==='boolean')settings[k]=v;else if(k==='trackerDelegate'&&['GPU','CPU'].includes(v))settings[k]=v;else if(Number.isFinite(v))settings[k]=Math.max(k==='trackingWidth'?192:0,Math.min(k==='trackingWidth'?640:60,v));}}}catch{}link?.sendJSON('p',{stage,w:video.videoWidth||0,h:video.videoHeight||0});}}});
  link.sendJSON('p',{stage});for(let i=0;i<20&&!receivedSettings;i++)await new Promise(r=>setTimeout(r,100));status('Opening camera — requesting '+settings.cameraFps+' FPS, GPU preferred');
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480},frameRate:{ideal:settings.cameraFps}}});video.srcObject=stream;video.muted=true;await video.play();stage='camera';link.sendJSON('p',{stage,w:video.videoWidth,h:video.videoHeight});
  navigator.wakeLock?.request('screen').then(lock=>{if(stopped)lock.release();else wake=lock;}).catch(()=>{});
  let lastPaint=0;session=startTracking(video,(data,frame)=>{stage='tracking';recent[data.task]=data;
   if(data.task==='hands')link.send('h',packHands(data));else link.sendJSON('a',encodeAux(data));
   if(performance.now()-lastPaint>1000/(settings.overlayRate||30)){lastPaint=performance.now();paint(frame);}
  },s=>{badge.textContent=`CAM ${s.camera} FPS\nHAND ${s.hands} · FACE ${s.face} · BODY ${s.pose}`;link.sendJSON('s',s);link.sendJSON('p',{stage,w:video.videoWidth,h:video.videoHeight});status(`Camera ${s.camera} observed FPS · fallback ${s.capturePolls||0}/s · hands ${s.hands} · face ${s.face} · shoulders ${s.pose} FPS · ${JSON.stringify(s.delegate)}${Object.keys(s.errors).length?' · '+JSON.stringify(s.errors):''}`);},()=>settings,{copyPreview:false});
  return stop;
 }catch(e){link?.sendJSON('p',{error:e.message});stop();throw e;}
}
