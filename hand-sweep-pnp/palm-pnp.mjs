// OpenCV EPnP initializes; solvePnP ITERATIVE refines rotation AND translation.
// Fixed model coordinates, never a per-frame palm-size multiplier.
export const PALM_IDS=[0,5,9,13,17];
export function solvePalmPose(cv,model,lm,aspect,focal,previous=null){
 if(model?.length!==5||!model.every(p=>p.length===3&&p.every(Number.isFinite))||!(aspect>0&&focal>0)||!PALM_IDS.every(i=>lm?.[i]&&Number.isFinite(lm[i].x)&&Number.isFinite(lm[i].y)))return null;
 const object=cv.matFromArray(5,1,cv.CV_64FC3,model.flat()),image=cv.matFromArray(5,1,cv.CV_64FC2,PALM_IDS.flatMap(i=>[lm[i].x,lm[i].y]));
 const K=cv.matFromArray(3,3,cv.CV_64F,[focal/aspect,0,.5,0,focal,.5,0,0,1]),D=cv.Mat.zeros(5,1,cv.CV_64F),candidates=[];
 try{
  for(const seed of [previous,null]){
   const r=seed?cv.matFromArray(3,1,cv.CV_64F,seed.rotation):new cv.Mat(),t=seed?cv.matFromArray(3,1,cv.CV_64F,seed.translation):new cv.Mat(),R=new cv.Mat(),projected=new cv.Mat();
   try{
    if(!seed&&!cv.solvePnP(object,image,K,D,r,t,false,cv.SOLVEPNP_EPNP))continue;
    if(!cv.solvePnP(object,image,K,D,r,t,true,cv.SOLVEPNP_ITERATIVE))continue;
    cv.Rodrigues(r,R);cv.projectPoints(object,r,t,K,D,projected);
    const translation=Array.from(t.data64F),rotation=Array.from(r.data64F),matrix=Array.from(R.data64F);
    if(![...translation,...rotation,...matrix].every(Number.isFinite)||translation[2]<.04||translation[2]>4)continue;
    if(model.some(p=>matrix[6]*p[0]+matrix[7]*p[1]+matrix[8]*p[2]+translation[2]<.02))continue;
    const error=Math.sqrt(PALM_IDS.reduce((sum,id,j)=>sum+(projected.data64F[j*2]-lm[id].x)**2+(projected.data64F[j*2+1]-lm[id].y)**2,0)/5);
    if(error>.015)continue;
    candidates.push({translation,rotation,matrix,error});
   }catch{}finally{r.delete();t.delete();R.delete();projected.delete();}
  }
  candidates.sort((a,b)=>a.error-b.error);
  // Near-equal projection fits can have different poses. Prefer temporal
  // continuity only within a small reprojection-error margin.
  if(previous&&candidates.length>1&&Math.abs(candidates[0].error-candidates[1].error)<.0005){
   candidates.sort((a,b)=>Math.hypot(...a.translation.map((v,i)=>v-previous.translation[i]))-Math.hypot(...b.translation.map((v,i)=>v-previous.translation[i])));
  }
  return candidates[0]??null;
 }finally{object.delete();image.delete();K.delete();D.delete();}
}
