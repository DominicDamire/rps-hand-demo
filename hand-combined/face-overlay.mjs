import neutral from './neutral-face.mjs';
// Fixed decorative face dots; no expression landmarks are drawn or transmitted.
export const faceIds=[10,152,234,454,33,133,263,362];
// Project a fixed neutral 3D mesh; tracked expressions never deform it.
export function drawFace(ctx,points,w,h,matrix){
 if(!points?.[33]||!points?.[133]||!points?.[263]||!points?.[362]||!matrix)return;
 const m=matrix,project=([x,y,z])=>[m[0]*x+m[4]*y+m[8]*z,-(m[1]*x+m[5]*y+m[9]*z)];
 const pts=neutral.map(project),avg=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
 const a=avg(pts[33],pts[133]),b=avg(pts[263],pts[362]);
 const target=i=>[points[i].x*w,points[i].y*h],ta=avg(target(33),target(133)),tb=avg(target(263),target(362));
 const dx=b[0]-a[0],dy=b[1]-a[1],tx=tb[0]-ta[0],ty=tb[1]-ta[1],den=dx*dx+dy*dy;if(den<1e-6)return;
 const c=(dx*tx+dy*ty)/den,s=(dx*ty-dy*tx)/den;ctx.fillStyle='#8ee3bf';
 for(const p of pts){const x=p[0]-a[0],y=p[1]-a[1];ctx.fillRect(w-(ta[0]+c*x-s*y)-1,ta[1]+s*x+c*y-1,2,2);}
}
export function drawShoulders(ctx,pose,face,w,h){
 const a=pose?.points?.[11],b=pose?.points?.[12];if(!a||!b||a.visibility<.4||b.visibility<.4)return;
 const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},chin=face?.points?.[152];ctx.strokeStyle='#8ee3bf';ctx.fillStyle='#8ee3bf';ctx.lineWidth=1.5;
 const line=(a,b)=>{ctx.beginPath();ctx.moveTo((1-a.x)*w,a.y*h);ctx.lineTo((1-b.x)*w,b.y*h);ctx.stroke();};line(a,b);if(chin)line(mid,chin);
 for(const p of [a,b,mid]){ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,3,0,Math.PI*2);ctx.fill();}
}
export function encodeAux(data){if(!data.face)return data;const {points,...face}=data.face;return {...data,face:{...face,indexedPoints:Object.entries(points).flatMap(([id,p])=>[+id,Math.round(p.x*65535),Math.round(p.y*65535)])}};}
export function decodeAux(data){if(!data.face?.indexedPoints)return data;const {indexedPoints,...face}=data.face,points={};for(let i=0;i<indexedPoints.length;i+=3)points[indexedPoints[i]]={x:indexedPoints[i+1]/65535,y:indexedPoints[i+2]/65535};return {...data,face:{...face,points}};}
