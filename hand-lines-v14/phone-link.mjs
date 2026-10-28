// Separate lab pairing namespace; never shares the game's camera code.
const config={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},{urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'}]};
export function receivePhone(onStream,onStatus,onEnd){
 if(!window.Peer||!window.QRCode)throw Error('Phone connection libraries could not load. Reload and try again.');
 const id='handlab-'+crypto.randomUUID(),peer=new Peer(id,{config});let call=null,closed=false;
 const box=document.createElement('dialog');box.className='phonePair';
 box.innerHTML='<h2>Use your phone camera</h2><p>Scan with your phone, then tap Start camera.<br>Same Wi-Fi is recommended. Relay fallback is available for other networks.</p><div class="qr"></div><p><a target="_blank" rel="noopener">Open phone camera page</a></p><p class="pairStatus">Creating connection…</p><button>Cancel connection</button>';
 const url=new URL('camera.html',import.meta.url);url.searchParams.set('pair',id);url.searchParams.set('v','14-camera3');
 box.querySelector('a').href=url.href;
 const status=t=>{if(closed)return;box.querySelector('.pairStatus').textContent=t;onStatus(t);};
 const close=()=>{if(closed)return;closed=true;call?.close();peer.destroy();box.close();box.remove();};
 const cancel=()=>{close();onEnd('Phone connection cancelled');};
 box.querySelector('button').onclick=cancel;box.oncancel=e=>{e.preventDefault();cancel();};document.body.append(box);box.showModal();
 peer.on('open',()=>{if(closed)return;new QRCode(box.querySelector('.qr'),{text:url.href,width:220,height:220,correctLevel:QRCode.CorrectLevel.M});status('Ready to scan');});
 peer.on('call',incoming=>{if(closed||call){incoming.close();return;}call=incoming;status('Phone found. Connecting video…');incoming.answer();
  incoming.on('stream',s=>{if(closed){s.getTracks().forEach(t=>t.stop());return;}box.close();onStream(s);});
  incoming.on('close',()=>{if(!closed){close();onEnd('Phone disconnected. Click Connect iPhone camera to reconnect.');}});
  incoming.on('error',e=>{if(!closed){close();onEnd('Phone connection failed: '+e.message);}});
  incoming.peerConnection?.addEventListener('iceconnectionstatechange',()=>{if(incoming.peerConnection.iceConnectionState==='failed')status('Video connection failed. Put both devices on the same Wi-Fi and reconnect.');});
 });
 peer.on('error',e=>status('Connection error: '+e.type+'. Cancel and try again.'));
 return close;
}
export async function sendPhone(id,video,status,facing='user'){
 if(!/^handlab-[a-f0-9-]{36}$/.test(id))throw Error('Scan a fresh QR code from the PC lab.');
 if(!window.Peer)throw Error('Connection library failed to load. Reload this page.');
 const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480},frameRate:{ideal:30}}});
 let peer,call,closed=false,wake,timer;
 const stop=()=>{if(closed)return;closed=true;clearTimeout(timer);call?.close();peer?.destroy();stream.getTracks().forEach(t=>t.stop());video.srcObject=null;wake?.release().catch(()=>{});};
 try{video.srcObject=stream;await video.play();peer=new Peer(undefined,{config});
  navigator.wakeLock?.request('screen').then(w=>{if(closed)w.release();else wake=w;}).catch(()=>{});
  peer.on('open',()=>{if(closed)return;status('Connecting to PC…');call=peer.call(id,stream);if(!call){status('Could not call the PC. Stop and reconnect.');return;}
   timer=setTimeout(()=>{if(!closed&&call.peerConnection?.connectionState!=='connected')status('Video connection timed out. Try the same Wi-Fi and scan a new QR from the PC.');},15000);
   call.on('close',()=>{if(!closed){stop();status('PC disconnected. Scan a new QR code to reconnect.');}});
   call.on('error',e=>{stop();status('Video error: '+e.message);});
   call.peerConnection?.addEventListener('connectionstatechange',()=>{const state=call.peerConnection.connectionState;if(state==='connected'){clearTimeout(timer);status('Streaming to your PC. Keep this page open.');}if(state==='failed')status('Connection failed. Use the same Wi-Fi, then stop and reconnect.');if(state==='disconnected')status('Connection interrupted. Keep this page open or reconnect.');});
  });peer.on('error',e=>{stop();status('Connection error: '+e.type+'. Scan a fresh QR from the PC.');});return stop;
 }catch(e){stop();throw e;}
}
