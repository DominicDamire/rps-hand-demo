const TAN=Math.tan(Math.PI/6);
export function cameraFrame(sourceAspect,viewAspect){return {width:Math.min(1,sourceAspect/viewAspect),height:Math.min(1,viewAspect/sourceAspect)};}
export function cameraUV(point,sourceAspect,viewAspect){const f=cameraFrame(sourceAspect,viewAspect);return {x:.5+(point.x-.5)*f.width,y:.5+(point.y-.5)*f.height};}
export function cameraPosition(point,depth,aspect){return [(point.x-.5)*2*TAN*aspect*depth,(.5-point.y)*2*TAN*depth,-depth];}
export function projectCamera([x,y,z],aspect){return {x:.5+x/(-z*2*TAN*aspect),y:.5-y/(-z*2*TAN)};}
export function liftCameraLandmarks(landmarks,world,sourceAspect,viewAspect,depth,scale){return landmarks.map((p,i)=>cameraPosition(cameraUV(p,sourceAspect,viewAspect),Math.max(.04,depth+(world[i].z-world[0].z)*scale),viewAspect));}
// With the wrist pinned to its camera ray, solve depth from all four MCPs.
export function fitPalmDepth(wrist,samples,aspect,fallback=.5){
 const ray=p=>[(p.x-.5)*2*TAN*aspect,(.5-p.y)*2*TAN],w=ray(wrist);let ab=0,aa=0;
 for(const {uv,offset} of samples){const r=ray(uv);for(let k=0;k<2;k++){const a=r[k]-w[k],b=offset[k]+r[k]*offset[2];ab+=a*b;aa+=a*a;}}
 const depth=aa>1e-8?ab/aa:fallback;return Number.isFinite(depth)&&depth>.05?Math.max(.08,Math.min(4,depth)):fallback;
}
