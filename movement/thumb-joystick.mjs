export function measureThumb(image,world,aspect=4/3,finger="thumb"){
 if(image?.length!==21||world?.length!==21||!world.every(p=>[p.x,p.y,p.z].every(Number.isFinite))||!image.every(p=>[p.x,p.y].every(Number.isFinite)))return null;
 const d=(a,b)=>Math.hypot(world[a].x-world[b].x,world[a].y-world[b].y,world[a].z-world[b].z);
 const reach=m=>d(m,m+3)/(d(m,m+1)+d(m+1,m+2)+d(m+2,m+3)||1);
 const open=[5,9,13,17].every(m=>reach(m)>.9);
 // Track thumb base (2) to tip (4).
 const span=(Math.hypot(image[0].x-image[9].x,(image[0].y-image[9].y)/aspect)+Math.hypot(image[5].x-image[17].x,(image[5].y-image[17].y)/aspect))/2;
 if(span<.015)return null;
 const palm=(d(0,9)+d(5,17))/2;if(palm<.005)return null;
 // A thumb lying against the closed fingers is a release, never a direction.
 // Measure along the knuckle row so this does not depend on screen rotation/mirroring.
 const row=[image[17].x-image[5].x,(image[17].y-image[5].y)/aspect];
 const row2=row[0]**2+row[1]**2;
 const along=row2>1e-8?((image[4].x-image[6].x)*row[0]+(image[4].y-image[6].y)/aspect*row[1])/row2:-Infinity;
 const wrapped=[5,9,13,17].filter(m=>reach(m)<.82).length>=3&&along>-.16&&d(4,6)/d(5,17)<.72;
 // Absolute mirrored camera position. The joystick anchor follows palm translation.
 const tip=finger==='index'?8:4;
 const palmPoint=[0,5,9,13,17].reduce((a,i)=>[a[0]+(1-image[i].x)/5,a[1]+image[i].y/aspect/5],[0,0]);
 return {open,rest:finger==='index'?reach(5)<.78:wrapped,scale:span,palm:palmPoint,point:[1-image[tip].x,image[tip].y/aspect],tip};
}
const REST_HOLD=200;   // ms a fist must be held before it re-places the circle; a single misread frame must not move it
const valid=s=>s?.point?.length===2&&s.point.every(Number.isFinite)&&Number.isFinite(s.scale)&&s.scale>0;
export function thumbVector(point,centre){
 if(!point||!centre||![...point,...centre].every(Number.isFinite))return null;
 const x=point[0]-centre[0],z=point[1]-centre[1],r=Math.hypot(x,z);
 if(r<=.14)return {x:0,z:0};
 // Full walking speed at the circle edge; a short extra reach boosts to 160%.
 const magnitude=r<=.5?(r-.14)/.36:1+Math.min(.6,(r-.5)*2);
 return {x:x/r*magnitude,z:z/r*magnitude};
}
export class ThumbJoystick {
 // `fistCentre`: with it on, a fist is both the stop AND the calibration - the circle jumps to wherever the
 // thumb is resting, so neutral is exact and every direction, forward included, is the same distance away. Off by
 // default, which keeps the original rule (the circle is captured once and never moves) and the tests that check it;
 // the movement page turns it on, and ?fistcentre=0 turns it back off.
 constructor(){this.size=.8;this.speed=4.5;this.fistCentre=false;this.reset();}
 reset(){this.centre=null;this.palm=null;this.scale=null;this.needsRest=true;this.settling=[];this.seen=-Infinity;this.restSince=null;this.stop('SHOW FINGER');}
 stop(reason){this.x=this.z=0;this.raw={x:0,z:0};this.candidate=null;this.lastTilt=null;this.reason=reason;}
 receive(sample,time){
  if(!valid(sample)){this.stop('TRACKING LOST');this.needsRest=true;this.settling=[];this.seen=-Infinity;return;}
  if(time<=this.seen)return;
  const elapsed=time-this.seen;if(elapsed>450){this.needsRest=true;this.stop('RETURN FINGER TO CENTRE');this.settling=[];}this.seen=time;
  if(sample.open){this.reset();this.seen=time;this.stop('OPEN PALM · RESET');return;}
  const t=sample.point;
  if(this.centre&&sample.palm&&this.palm){
   const delta=sample.palm.map((v,i)=>v-this.palm[i]);
   if(Math.hypot(...delta)>this.scale*.75){this.reset();this.seen=time;this.stop('HAND REPOSITIONED');return;}
   // Compensate whole-fist translation equally in the ring and fingertip.
   // Holding a finger deflection keeps walking; moving the fist alone does not steer.
   this.centre=this.centre.map((v,i)=>v+delta[i]);
  }
  if(sample.palm)this.palm=[...sample.palm];
  // First visible finger places the circle, with no timed pose setup.
  if(!this.centre){
   this.centre=[...t];this.scale=sample.scale;
   // The offset puts the circle above a folded finger, which the thumb does not need: its rest position IS the neutral.
   if(sample.rest&&(sample.tip===8||!this.fistCentre))this.centre[1]-=(sample.tip===8?.7:.35)*this.scale;
   this.needsRest=false;this.stop('READY');return;
  }
  if(sample.rest){
   this.needsRest=false;
   if(this.fistCentre){   // a fist HELD still is the calibration: put the circle back around the finger resting there
    this.restSince ??= time;
    if(time-this.restSince>=REST_HOLD){
     this.scale=sample.scale;
     if(sample.tip===8){this.centre=[t[0],t[1]-.7*this.scale];}else this.centre=[...t];
     this.stop('FIST REST · CENTRED');return;
    }
   }
   this.stop('FIST REST');return;
  }
  this.restSince=null;
  const offset=t.map((v,i)=>(v-this.centre[i])/this.effectiveScale);
  if(this.needsRest){
   if(Math.hypot(...offset)>.20){this.stop('RETURN FINGER TO CENTRE');return;}
   this.needsRest=false;this.stop('NEUTRAL');return;
  }
  const active=Math.hypot(this.x,this.z)>.01;
  // Fingertip movement relative to the fist steers without chasing the tip.
  if(!active&&Math.hypot(...offset)<.20){this.stop('NEUTRAL');return;}
  const v=thumbVector(offset,[0,0]);if(!v){this.stop('THUMB UNCLEAR');return;}this.raw={...v};
  if(Math.hypot(v.x,v.z)<.001){this.stop('NEUTRAL');return;}
  const change=Math.hypot(v.x-this.x,v.z-this.z);
  if(active&&Math.hypot(v.x,v.z)>=Math.hypot(this.x,this.z)&&change<.07){this.candidate=null;return;}
  if(!active||change>.8){
   const agreement=this.candidate?(v.x*this.candidate.x+v.z*this.candidate.z)/(Math.hypot(v.x,v.z)*Math.hypot(this.candidate.x,this.candidate.z)):-1;
   if(!this.candidate||agreement<Math.cos(Math.PI/5))this.candidate={...v,since:time,count:1};else this.candidate.count++;
   if(this.candidate.count<2||time-this.candidate.since<25){if(!active)this.reason='CONFIRMING TILT';return;}
  }
  this.candidate=null;const alpha=active?1-Math.exp(-Math.min(100,elapsed)/18):1;
  this.x+=(v.x-this.x)*alpha;this.z+=(v.z-this.z)*alpha;this.lastTilt=t;this.reason='MOVING';
 }
 get effectiveScale(){return this.scale===null?null:this.scale*this.size;}
 setSize(value){if(!Number.isFinite(value))return;this.size=Math.max(.35,Math.min(1.6,value));this.needsRest=true;this.stop('RETURN FINGER TO CENTRE');}
 get direction(){return Math.hypot(this.x,this.z)>.01?[this.z<-.05?'FORWARD':this.z>.05?'BACKWARD':'',this.x<-.05?'LEFT':this.x>.05?'RIGHT':''].filter(Boolean).join(' '):null;}
 step(now,dt=.016){if(now-this.seen>450){this.needsRest=true;this.settling=[];this.stop('TRACKING LOST');}const d=this.speed*Math.min(.05,Math.max(0,dt));return {dx:this.x*d,dz:this.z*d};}
}
