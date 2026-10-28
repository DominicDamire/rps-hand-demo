export function calibratedReference(fit,enabled,distanceEnabled,centimetres){
 if(!fit||!enabled)return null;
 if(!distanceEnabled||!(centimetres>=10&&centimetres<=250)||!(fit.shoulderDistance>.04))return fit;
 const factor=centimetres/100/fit.shoulderDistance;
 return {...fit,handScale:fit.handScale*factor,depthGain:fit.depthGain*factor,headScale:fit.headScale*factor,headOffset:fit.headOffset.map(v=>v*factor),nearDepth:fit.nearDepth*factor,endDepth:fit.endDepth*factor,neckDepth:fit.neckDepth*factor,farDepth:fit.neckDepth*factor+.30,shoulderDepth:fit.shoulderDepth*factor,shoulderDistance:centimetres/100,shoulderPoint:fit.shoulderPoint.map(v=>v*factor),distanceReference:true};
}
