const RAD=Math.PI/180;
export class HeadLook {
 constructor(){this.heading=0;this.gain=1.5;this.lookGain=2.5;this.deadzoneDegrees=14;this.smooth=.025;this.mode='hybrid';this.recenterPitch=false;this.resetLook();}
 // The class keeps its original response, which its own tests pin. The page asks for a calmer one at startup
 // (app.mjs: lookGain from the slider, smooth 0.12), because 2.5x through a 25 ms filter swung the view too far and
 // jittered with the tracker.
 resetLook(){this.speed=0;this.look=0;this.pitch=0;this.pending=0;this.direction=0;this.turning=false;this.previous=null;this.samples=[];this.armed=true;this.neutralTime=0;this.progress=0;this.state='LOOK ONLY';}
 update(yaw,dt,valid=true,sampleTime=null){
  dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));this.speed=0;
  if(!valid||!Number.isFinite(yaw)){this.previous=null;this.samples=[];this.pending=0;this.turning=false;this.progress=0;this.state='TRACKING PAUSED';return this.heading+this.look;}
  const angle=Math.abs(yaw),direction=Math.sign(yaw),dead=this.deadzoneDegrees*RAD;
  const target=Math.max(-70*RAD,Math.min(70*RAD,yaw*this.lookGain));
  this.look+=(target-this.look)*(1-Math.exp(-dt/Math.max(.01,this.smooth)));this.state='LOOK ONLY';this.progress=0;
  if(this.mode==='quick'||this.mode==='hybrid'){
   // One outward flick; returning to centre never reverses the body turn.
   if(angle<Math.max(5,this.deadzoneDegrees-5)*RAD){this.neutralTime+=dt;if(this.neutralTime>=.15)this.armed=true;}else this.neutralTime=0;
   const stamp=sampleTime??((this.previous?.time??0)+dt*1000);
   if(!this.previous||stamp>this.previous.time){
    // Accumulate a flick across frames: high frame rates split it into small deltas.
    this.samples=this.samples.filter(p=>stamp-p.time<=260);
    if(this.armed&&angle>=dead){
     const flick=this.samples.some(p=>{const seconds=(stamp-p.time)/1000,delta=yaw-p.yaw;
      return seconds>0&&Math.abs(p.yaw)<angle&&Math.sign(delta)===direction&&Math.abs(delta)>=dead&&Math.abs(delta)/seconds>=(this.mode==='hybrid'?90:60)*RAD;
     });
     if(flick){this.heading+=direction*(this.mode==='hybrid'?20:30)*RAD*(this.gain/1.5);this.armed=false;this.samples=[];}
    }
    this.samples.push({yaw,time:stamp});
    this.previous={yaw,time:stamp};
   }
   if(!this.armed)this.state='BODY TURNED · CENTRE TO REARM';
  }
  if(this.mode!=='quick'){
   const outside=angle>(this.turning?Math.max(5,this.deadzoneDegrees-3)*RAD:dead);
   if(!outside||direction!==this.direction){this.pending=0;this.turning=false;}
   this.direction=direction;
   if(outside){this.pending+=dt;this.progress=Math.min(1,this.pending/(this.mode==='hybrid'?.3:.22));
    if(this.pending>=(this.mode==='hybrid'?.3:.22))this.turning=true;
    if(this.turning){const amount=Math.min(1,Math.max(0,(angle-Math.max(5,this.deadzoneDegrees-3)*RAD)/(20*RAD)));this.speed=direction*(this.mode==='hybrid'?Math.min(1,Math.max(0,(angle-Math.max(5,this.deadzoneDegrees-3)*RAD)/(12*RAD)))**1.1*100:amount**1.4*90)*RAD*(this.gain/1.5);this.heading+=this.speed*dt;this.state=direction>0?'BODY TURN LEFT':'BODY TURN RIGHT';}
    else this.state='HOLD TO TURN';
   }
  }
  return this.heading+this.look;
 }
 updatePitch(pitch,dt,valid=true){
  // `recenterPitch` (off by default, so the original rule and its test stand): losing the face used to freeze the view
  // at whatever angle it was last at, so a glance down before the tracker dropped left the player staring at the floor
  // with no way back. With it on, and nothing to follow, the pitch eases level again over about a second.
  if(!valid||!Number.isFinite(pitch)){
   if(this.recenterPitch)this.pitch+=(0-this.pitch)*(1-Math.exp(-Math.min(.1,Math.max(0,dt))/.6));
   return this.pitch;
  }
  const target=Math.max(-70*RAD,Math.min(70*RAD,pitch*this.lookGain));
  this.pitch+=(target-this.pitch)*(1-Math.exp(-Math.min(.1,Math.max(0,dt))/Math.max(.01,this.smooth)));return this.pitch;
 }

}
export function bodyDisplacement(dx,dz,heading){return {x:Math.cos(heading)*dx+Math.sin(heading)*dz,z:-Math.sin(heading)*dx+Math.cos(heading)*dz};}
