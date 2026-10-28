// Share inference time fairly without queueing frames or starving either tracker.
export class TrackingScheduler {
 constructor(){this.last='head';}
 next({busy=false,handReady=false,headReady=false}){
  if(busy)return null;
  const next=handReady&&headReady?(this.last==='head'?'hand':'head'):headReady?'head':handReady?'hand':null;
  if(next)this.last=next;
  return next;
 }
}
export function freshHead(result,now){return !!result?.pose&&Number.isFinite(result.ts)&&now>=result.ts&&now-result.ts<450;}
