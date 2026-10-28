// Detect a reversal of adjacent finger order in the tracked image. A bent
// upper joint alone is not evidence that its base knuckle is in a closed fist.
export function crossingFingers(lm,aspect=1){
 if(!lm?.[20])return [];
 const ax=(lm[5].x-lm[17].x)*aspect,ay=lm[5].y-lm[17].y,span=Math.hypot(ax,ay);
 if(span<.012)return [];
 const lateral=i=>((lm[i].x-.5)*aspect*ax+(lm[i].y-.5)*ay)/span;
 const fingers=new Set();
 for(let f=1;f<4;f++){
  const a=1+4*f,b=a+4,base=lateral(b)-lateral(a);
  if(Math.abs(base)<span*.02)continue;
  if([2,3].some(k=>(lateral(b+k)-lateral(a+k))*Math.sign(base)<-span*.015)){fingers.add(f);fingers.add(f+1);}
 }
 return [...fingers];
}
