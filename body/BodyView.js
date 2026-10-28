import {BodyPose} from './pose.mjs?v=edge8';

export class BodyView {
  constructor(video,head,{mode,status,recenter}){
    this.video=video;this.head=head;this.control=mode;this.status=status;
    this.pose=new BodyPose(mode.value);this.enabled=mode.value!=='off';
    this.lastCapture=-Infinity;this.lastVideo=-1;this.busy=false;this.ready=false;
    this.frames=0;this.fps=0;this.latency=0;this.misses=0;this.windowStart=performance.now();
    this.generation=0;
    this.lastFaceCount=0;
    mode.addEventListener('change',()=>{
      this.enabled=mode.value!=='off';this.pose.recenter(mode.value);
      if(!this.enabled)this.stop();else this.failed=false;
    });
    recenter.addEventListener('click',()=>this.pose.recenter(this.control.value));
    addEventListener('pagehide',()=>this.stop(),{once:true});
  }
  stop(){this.generation++;this.worker?.terminate();this.worker=null;this.ready=false;this.busy=false;clearTimeout(this.timer);}
  start(){
    try{
      this.worker=new Worker(new URL('./worker.mjs?v=edge8',import.meta.url),{type:'module'});
      const fail=()=>{this.stop();this.failed=true;};
      this.worker.onerror=fail;
      this.worker.onmessage=({data})=>{
        if(data.type==='error')return fail();
        if(data.type==='ready'){this.ready=true;this.delegate=data.delegate;clearTimeout(this.timer);return;}
        if(data.type==='pose'){
          this.busy=false;const now=performance.now();this.latency=now-data.ts;
          this.frames++;if(now-this.windowStart>=1000){this.fps=Math.round(this.frames*1000/(now-this.windowStart));this.frames=0;this.windowStart=now;}
          this.pose.receive(data.pose,now);
          this.misses=data.pose?0:this.misses+1;
        }
      };
      this.timer=setTimeout(fail,60000);
    }catch{this.failed=true;this.stop();}
  }
  wantsFrame(now){
    const nearEdge=this.pose.partial||this.pose.evidence?.length>0;
    // The arms do not need 15 samples a second, and the hand tracker does need the GPU, so the base
    // interval is 150 ms (about 6 a second) instead of 66 ms.
    const interval=this.misses>=3&&!nearEdge?320:Math.max(this.latency,this.head.performance.latency)>65?220:150;
    // The "two finished face frames earn one body frame" rule and the head.busy check below made all
    // three trackers queue behind each other. They are separate workers, so each one now just keeps its own interval.
    return this.enabled&&this.head.mode!=='off'&&!document.hidden&&this.ready&&!this.busy&&!this.failed&&
      now-this.lastCapture>=interval&&
      this.video.readyState>=2&&this.video.currentTime!==this.lastVideo;
  }
  async capture(now){
    // Each worker admits at most one fresh frame. Its adaptive interval limits
    // load without serializing body inference behind the face worker.
    if(!this.wantsFrame(now))return;
    this.busy=true;this.lastCapture=now;this.lastVideo=this.video.currentTime;
    this.lastFaceCount=this.head.completedFrames;
    const generation=this.generation;
    try{
      const width=Math.min(512,this.video.videoWidth);
      const frame=await createImageBitmap(this.video,{resizeWidth:width,resizeHeight:Math.round(width*this.video.videoHeight/this.video.videoWidth)});
      if(generation!==this.generation){frame.close();return;}
      this.worker.postMessage({frame,ts:now},[frame]);
    }catch{if(generation===this.generation){this.stop();this.failed=true;}}
  }
  update(now,dt){
    const active=this.enabled&&this.head.mode!=='off'&&!document.hidden;
    if(active&&!this.worker&&!this.failed&&this.head.ready)this.start();
    if(active&&!this.failed)this.capture(now);
    this.joints=this.pose.update(now,dt,active,this.head.camera?.position?.toArray?.()??[0,0,0]);
    const mode=this.control.value;
    this.status.textContent=!this.enabled?'Head only · body pose inferred':!active?'Body paused':this.failed?'Body unavailable · head tracking continues':!this.ready?'Loading body tracking…':
      now-this.pose.seen>220?'Body landmarks out of frame · arms relaxed · head still live':
      mode==='standing'&&!this.pose.hipsTracked?'Show your hips for standing tracking · head tracking continues':
      !this.pose.neutral?`Hold a relaxed ${mode} pose · calibrating ${Math.min(100,Math.round(this.pose.samples.length/12*100))}%`:
      `Body: ${this.fps} fps · ${Math.round(this.latency)} ms · ${mode}${this.pose.partial?' · following visible joints':mode==='seated'?' · head carries body':this.pose.hipsTracked?'':' · lower torso estimated'}`;
    return this.joints;
  }
}
