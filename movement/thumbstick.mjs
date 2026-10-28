export function stickVector(x,y,radius=54){
 const length=Math.hypot(x,y),amount=Math.min(1,Math.max(0,(length/radius-.08)/.92));
 return length?{x:x/length*amount,z:y/length*amount}:{x:0,z:0};
}
export function setupThumbstick(el,knob){
 let pointer=null,vector={x:0,z:0};
 const draw=()=>{knob.style.transform=`translate(${vector.x*54}px,${vector.z*54}px)`;};
 const reset=()=>{pointer=null;vector={x:0,z:0};draw();};
 const move=e=>{const r=el.getBoundingClientRect();vector=stickVector(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2);draw();};
 el.addEventListener('pointerdown',e=>{if(pointer!==null||e.button!==0)return;e.preventDefault();pointer=e.pointerId;el.setPointerCapture(pointer);move(e);});
 el.addEventListener('pointermove',e=>{if(e.pointerId===pointer){e.preventDefault();move(e);}});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,e=>{if(e.pointerId===pointer)reset();});
 const keys=new Set();
 const updateKeys=()=>{vector=stickVector(((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*54,((keys.has('ArrowDown')?1:0)-(keys.has('ArrowUp')?1:0))*54);draw();};
 el.addEventListener('keydown',e=>{if(e.key.startsWith('Arrow')){e.preventDefault();keys.add(e.key);updateKeys();}});
 el.addEventListener('keyup',e=>{if(keys.delete(e.key)){e.preventDefault();updateKeys();}});
 const release=()=>{keys.clear();reset();};
 el.addEventListener('blur',release);window.addEventListener('blur',release);window.addEventListener('resize',release);document.addEventListener('visibilitychange',release);
 return {get vector(){return vector;},reset:release};
}
