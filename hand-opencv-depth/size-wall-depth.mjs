// Translation depth uses only the apparent palm size. Fingers may curl/spread.
export function imagePalmSize(points,aspect=1){
 const spans=[[0,5],[0,9],[0,13],[0,17],[5,17]].map(([a,b])=>points?.[a]&&points?.[b]?Math.hypot((points[a].x-points[b].x)*aspect,points[a].y-points[b].y):0).filter(v=>Number.isFinite(v)&&v>1e-5).sort((a,b)=>a-b);
 return spans.length?spans[Math.floor(spans.length/2)]:null;
}
export function sizeDepth(size,reference,fallback=.5){
 return size>0&&reference?.size>0?Math.max(.04,reference.depth*reference.size/size):fallback;
}
// Tracking space looks along -Z; translate the whole rigid hand toward +Z.
export function wallShift(backmostZ,wallZ){return Math.max(0,wallZ-backmostZ);}
