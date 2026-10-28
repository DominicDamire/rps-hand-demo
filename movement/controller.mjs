const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const median=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];

// Image coordinates supply lateral motion; projected palm dimensions estimate camera distance.
// World landmarks are hand-centred: their z alone must never be used as camera distance.
export function measureHand(image,world,aspect=4/3){
  if(image?.length!==21||world?.length!==21||![...image,...world].every(p=>[p.x,p.y,p.z].every(Number.isFinite)))return null;
  const palm=dist(world[5],world[17]); if(palm<.02)return null;
  const focal=.5/Math.tan(Math.PI/6), depths=[];
  for(const [a,b] of [[0,5],[0,9],[0,17],[5,17],[5,9],[9,17]]){
    const projected=Math.hypot(world[a].x-world[b].x,world[a].y-world[b].y);
    const pixels=Math.hypot(image[a].x-image[b].x,(image[a].y-image[b].y)/aspect);
    if(projected>.015&&pixels>.018)depths.push(focal*projected/pixels);
  }
  if(depths.length<3)return null;
  const depth=median(depths), spread=median(depths.map(v=>Math.abs(v-depth)))/depth;
  if(depth<.12||depth>1.6||spread>.3)return null;
  const chain=dist(world[5],world[6])+dist(world[6],world[7])+dist(world[7],world[8]);
  return {x:1-(image[4].x+image[8].x)/2,z:depth,
    indexX:1-image[8].x,pinch:dist(world[4],world[8])/palm,
    extended:dist(world[5],world[8])/chain>.91&&dist(world[0],world[8])>dist(world[0],world[6])*1.1};
}

export class MovementController{
  constructor(){this.mode='pinch';this.gain=12;this.reverse=false;this.reset();}
  reset(){this.active=false;this.pending=null;this.last=null;this.filtered=null;this.anchor=null;this.time=null;}
  update(sample,time){
    const zero={dx:0,dz:0,active:false,status:'Show one hand'};
    if(!sample||![sample.x,sample.z,time].every(Number.isFinite)){this.reset();return zero;}
    const engaged=this.mode==='pinch'?sample.pinch<(this.active?.55:.35):sample.extended;
    if(!engaged){this.reset();return {...zero,status:this.mode==='pinch'?'Pinch to grab':'Extend your index finger'};}
    const point={x:this.mode==='index'?(sample.indexX??sample.x):sample.x,z:sample.z};
    if(this.time!==null&&(time<=this.time||time-this.time>180))this.reset();
    if(this.last&&(Math.abs(point.x-this.last.x)>.14||Math.abs(point.z-this.last.z)>.12)){this.reset();return {...zero,status:'Reposition and grab again'};}
    const dt=this.time===null?0:time-this.time;this.time=time;this.last=point;
    if(!this.active){
      if(this.pending===null)this.pending=time;
      this.filtered={...point};this.anchor={...point};
      if(time-this.pending<40)return {...zero,status:this.mode==='index'?'Index detected…':'Grabbing…'};
      this.active=true;return {...zero,active:true,status:this.mode==='index'?'Index ready · move your finger':'Grabbed · move your hand'};
    }
    const alpha=1-Math.exp(-dt/18);
    this.filtered.x+=alpha*(point.x-this.filtered.x);this.filtered.z+=alpha*(point.z-this.filtered.z);
    const consume=(axis,dead)=>{const d=this.filtered[axis]-this.anchor[axis];const out=Math.sign(d)*Math.max(0,Math.abs(d)-dead);this.anchor[axis]+=out;return out;};
    const dx=consume('x',.007)*this.filtered.z*1.1547*this.gain;
    // Camera distance falls on a push: positive scene z means backward.
    const dz=-consume('z',.009)*this.gain*(this.reverse?-1:1);
    const limit=12*dt/1000, length=Math.hypot(dx,dz), k=length>limit?limit/length:1;
    return {dx:dx*k,dz:dz*k,active:true,status:Math.hypot(dx,dz)<.0001?(this.mode==='index'?'Index ready · hold still to stop':'Grabbed · hold still to stop'):'Moving'};
  }
}
