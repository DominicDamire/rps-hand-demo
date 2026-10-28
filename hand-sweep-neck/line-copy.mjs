import {cameraPosition,cameraUV,projectCamera} from './projection.mjs';

// Sweep supplies one wrist depth. Every joint stays on its observed camera ray.
export function copyImageLines(landmarks,depth,sourceAspect,viewAspect){
 return landmarks.map(point=>cameraPosition(cameraUV(point,sourceAspect,viewAspect),depth,viewAspect));
}

export function lineCopyError(points,landmarks,sourceAspect,viewAspect,width,height){
 let sum=0,max=0,lineSum=0,lineMax=0,lineCount=0,baseMax=0;
 const projected=points.map(p=>projectCamera(p,viewAspect));
 const observed=landmarks.map(p=>cameraUV(p,sourceAspect,viewAspect));
 for(let i=0;i<landmarks.length;i++){
  const target=observed[i],actual=projected[i];
  const error=Math.hypot((actual.x-target.x)*width,(actual.y-target.y)*height);
  sum+=error*error;max=Math.max(max,error);
 }
 for(let f=0;f<5;f++){
  const first=1+f*4,baseError=Math.hypot((projected[first].x-observed[first].x)*width,(projected[first].y-observed[first].y)*height);
  baseMax=Math.max(baseMax,baseError);
  for(let k=1;k<4;k++){
   const a=first+k-1,b=first+k;
   const error=Math.hypot(((projected[b].x-projected[a].x)-(observed[b].x-observed[a].x))*width,((projected[b].y-projected[a].y)-(observed[b].y-observed[a].y))*height);
   lineSum+=error*error;lineMax=Math.max(lineMax,error);lineCount++;
  }
 }
 return {rms:Math.sqrt(sum/landmarks.length),max,lineRms:Math.sqrt(lineSum/lineCount),lineMax,baseMax};
}
