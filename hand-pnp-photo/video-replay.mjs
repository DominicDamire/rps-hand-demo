// Local files are decoded in the browser. No video upload or landmark server.
export function installVideoReplay({container,onStart,onFrame,onView,onCalibrated}){
 const panel=document.createElement('section');panel.style.display='block';
 panel.innerHTML='<h2>Recorded movement in 3D</h2><label class="button">Load movement video<input type="file" accept="video/*,.mov" hidden></label><label><input id="recordedIndexContact" type="checkbox" checked> Index fingertips touch in the calibration clip</label><label><input id="recordedNeckCalibration" type="checkbox" checked> Use near-neck poses to calibrate head and hand depth</label><p>Enable this only for a clip that moves the touching hands back to the neck. It saves one fixed estimate from the recording.</p><p>This supplies the contact constraint for fitting. After calibration, all contact and collision corrections switch OFF so you can inspect the actual replay errors.</p><p>Processed on this computer. Your video is not uploaded. The black preview shows its tracking lines.</p><p role="status">Choose a video to replay its movement.</p><div class="row"><button disabled>Pause</button><button disabled>Restart</button></div><label>Video position<input type="range" min="0" max="1" value="0" step="0.033333" disabled></label><output></output><div class="row"><button data-view="side">Side view</button><button data-view="top">Top view</button></div>';
 container.prepend(panel);const input=panel.querySelector('input[type=file]'),status=panel.querySelector('[role=status]'),[play,restart]=panel.querySelectorAll('button'),seek=panel.querySelector('input[type=range]'),clock=panel.querySelector('output');
 const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');let frames=[],token=0,url=null,ready=false,workers=[],lastIndex=-1,run=0,checkIndex=null,calibrating=false;
 function stop(){checkIndex=null;calibrating=false;token++;ready=false;video.pause();workers.forEach(w=>w.close());workers=[];frames=[];lastIndex=-1;play.disabled=restart.disabled=seek.disabled=true;if(url){URL.revokeObjectURL(url);url=null;}video.removeAttribute('src');video.load();}
 async function seekTo(t){if(Math.abs(video.currentTime-t)<1e-5&&video.readyState>=2)return;await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{cleanup();reject(Error('Video seek timed out'));},10000),done=()=>{cleanup();resolve();},cleanup=()=>{clearTimeout(timeout);video.removeEventListener('seeked',done);};video.addEventListener('seeked',done,{once:true});video.currentTime=t;});}
 function worker(task){const w=new Worker(new URL('./tracker.mjs?v=photo1'+task+'&delegate=GPU',import.meta.url),{type:'module'});let pending=null;
  const receive=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending=null;reject(Error(task+' tracker timed out'));},60000);pending={resolve:x=>{clearTimeout(timer);resolve(x);},reject:e=>{clearTimeout(timer);reject(e);}};});
  w.onmessage=({data})=>{if(!pending)return;const p=pending;pending=null;data.type==='error'?p.reject(Error(data.message)):p.resolve(data);};w.onerror=e=>{pending?.reject(Error(e.message));pending=null;};
  const started=receive();w.postMessage({type:'init'});
  return {ready:started,async detect(time){const bitmap=await createImageBitmap(canvas);const result=receive();w.postMessage({type:'frame',bitmap,time},[bitmap]);return result;},close(){w.terminate();pending?.reject(Error('Video processing cancelled'));pending=null;}};
 }
 async function load(source){onStart();stop();const id=token;run++;status.textContent='Opening video…';try{
  url=source instanceof File?URL.createObjectURL(source):source;
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('This browser cannot decode the video. Try an MP4/H.264 copy.'));video.src=url;video.load();});
  if(id!==token)return;if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Video duration is unavailable');
  canvas.width=640;canvas.height=Math.round(640*video.videoHeight/video.videoWidth);
  workers=['hands','face','pose'].map(worker);await Promise.all(workers.map(w=>w.ready));
  const count=Math.ceil(video.duration*30);let face=null,pose=null,two=0;
  for(let i=0;i<count;i++){
   if(id!==token)return;const t=Math.min(i/30,video.duration-.001);await seekTo(t);if(id!==token)return;context.drawImage(video,0,0,canvas.width,canvas.height);
   const results=await Promise.all([workers[0].detect(i*1000/30+1),...(i%3===0?[workers[1].detect(i*1000/30+1),workers[2].detect(i*1000/30+1)]:[])]);
   if(id!==token)return;if(results[1])face=results[1];if(results[2])pose=results[2];
   frames.push({hands:results[0],face,pose,index:i});if(results[0].landmarks?.length===2)two++;
   status.textContent='Processing '+(i+1)+'/'+count+' frames · both hands detected in '+two+' frames. This is offline processing, not live FPS.';
  }
  workers.forEach(w=>w.close());workers=[];await seekTo(0);if(id!==token)return;ready=true;seek.max=video.duration;play.disabled=restart.disabled=seek.disabled=false;
  status.textContent='Ready: '+frames.length+' frames at 30 samples/s; both hands detected in '+two+'/'+frames.length+'. Use Explore in 3D to inspect contact from the side.';play.textContent='Play';checkIndex=0;calibrating=true;play.disabled=restart.disabled=seek.disabled=true;status.textContent='Fitting hands and head from all recorded frames…';
 }catch(e){if(id===token){status.textContent=e.message;workers.forEach(w=>w.close());workers=[];video.pause();}}}
 for(const button of panel.querySelectorAll('[data-view]'))button.onclick=()=>onView(button.dataset.view);
 input.onchange=()=>{const file=input.files[0];if(file)load(file);input.value='';};
 play.onclick=()=>{if(video.paused){if(video.ended)video.currentTime=0;video.play();play.textContent='Pause';}else{video.pause();play.textContent='Play';}};
 restart.onclick=()=>{video.currentTime=0;video.play();play.textContent='Pause';lastIndex=-1;};seek.oninput=()=>{video.pause();video.currentTime=+seek.value;play.textContent='Play';};video.onended=()=>play.textContent='Play';
 return {load,stop,get neckCalibration(){return panel.querySelector('#recordedNeckCalibration').checked;},get calibrating(){return calibrating;},afterRender(){if(checkIndex===null)return;if(++checkIndex>=frames.length){checkIndex=null;calibrating=false;play.disabled=restart.disabled=seek.disabled=false;const report=onCalibrated?.();status.textContent=report||'Video fit complete';video.currentTime=0;lastIndex=-1;if(!(location.hostname==='127.0.0.1'&&new URLSearchParams(location.search).has('reviewVideo'))){video.play();play.textContent='Pause';}}},get contactDeclared(){return panel.querySelector('#recordedIndexContact').checked;},get active(){return ready;},update(){if(!ready||video.readyState<2||video.seeking)return;const checking=checkIndex!==null,index=checking?checkIndex:Math.min(frames.length-1,Math.floor(video.currentTime*30)),record=frames[index];if(!record)return;context.drawImage(video,0,0,canvas.width,canvas.height);onFrame(record,canvas,run*1000000+index*1000/30,lastIndex!==index);lastIndex=index;seek.value=checking?index/30:video.currentTime;clock.textContent=checking?'Checking 3D frame '+(index+1)+'/'+frames.length:video.currentTime.toFixed(2)+' / '+video.duration.toFixed(2)+' s';}};
}
