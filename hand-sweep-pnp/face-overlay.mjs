import neutral from './neutral-face.mjs';
// Fixed decorative face dots; no expression landmarks are drawn or transmitted.
export const faceIds=[10,152,234,454,33,133,263,362];
// Project a fixed neutral 3D mesh; tracked expressions never deform it.
export function projectFaceDots(points,matrix,aspect=1){
 if(!points?.[33]||!points?.[133]||!points?.[263]||!points?.[362]||!matrix)return [];
 const m=matrix,pts=neutral.map(([x,y,z])=>[m[0]*x+m[4]*y+m[8]*z,-(m[1]*x+m[5]*y+m[9]*z)]),avg=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
 const a=avg(pts[33],pts[133]),b=avg(pts[263],pts[362]),target=i=>[points[i].x*aspect,points[i].y],ta=avg(target(33),target(133)),tb=avg(target(263),target(362));
 const dx=b[0]-a[0],dy=b[1]-a[1],tx=tb[0]-ta[0],ty=tb[1]-ta[1],den=dx*dx+dy*dy;if(den<1e-6)return [];
 const c=(dx*tx+dy*ty)/den,s=(dx*ty-dy*tx)/den;
 return pts.map(p=>{const x=p[0]-a[0],y=p[1]-a[1];return {x:(ta[0]+c*x-s*y)/aspect,y:ta[1]+s*x+c*y};});
}
export function drawFace(ctx,points,w,h,matrix,highlight=-1){
 const dots=projectFaceDots(points,matrix,w/h);ctx.fillStyle='#8ee3bf';
 for(const p of dots)ctx.fillRect(w-p.x*w-1,p.y*h-1,2,2);
 if(dots[highlight]){const p=dots[highlight];ctx.fillStyle='#ffc56e';ctx.fillRect(w-p.x*w-3,p.y*h-3,6,6);}
}
export function drawShoulders(ctx,pose,face,w,h,highlight=-1){
 const a=pose?.points?.[11],b=pose?.points?.[12];if(!a||!b||a.visibility<.4||b.visibility<.4)return;
 const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},chin=face?.points?.[152];ctx.strokeStyle='#8ee3bf';ctx.fillStyle='#8ee3bf';ctx.lineWidth=1.5;
 const line=(a,b)=>{ctx.beginPath();ctx.moveTo((1-a.x)*w,a.y*h);ctx.lineTo((1-b.x)*w,b.y*h);ctx.stroke();};line(a,b);if(chin)line(mid,chin);
 for(const p of [a,b,mid]){ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,3,0,Math.PI*2);ctx.fill();}if(pose.points[highlight]){const p=pose.points[highlight];ctx.fillStyle='#ffc56e';ctx.fillRect((1-p.x)*w-3,p.y*h-3,6,6);}
}
export function encodeAux(data){if(!data.face)return data;const {points,...face}=data.face;return {...data,face:{...face,indexedPoints:Object.entries(points).flatMap(([id,p])=>[+id,Math.round(p.x*65535),Math.round(p.y*65535)])}};}
export function decodeAux(data){if(!data.face?.indexedPoints)return data;const {indexedPoints,...face}=data.face,points={};for(let i=0;i<indexedPoints.length;i+=3)points[indexedPoints[i]]={x:indexedPoints[i+1]/65535,y:indexedPoints[i+2]/65535};return {...data,face:{...face,points}};}

export function drawUpperBody(ctx,pose,w,h){
 const points=pose?.points;if(!points)return;ctx.strokeStyle='#8ee3bf';ctx.fillStyle='#8ee3bf';ctx.lineWidth=2;
 const visible=i=>points[i]&&(points[i].visibility??0)>.28;
 for(const [a,b] of [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]])if(visible(a)&&visible(b)){ctx.beginPath();ctx.moveTo((1-points[a].x)*w,points[a].y*h);ctx.lineTo((1-points[b].x)*w,points[b].y*h);ctx.stroke();}
 for(const i of [0,2,5,7,8,11,12,13,14,15,16,23,24])if(visible(i)){ctx.beginPath();ctx.arc((1-points[i].x)*w,points[i].y*h,3,0,Math.PI*2);ctx.fill();}
}
