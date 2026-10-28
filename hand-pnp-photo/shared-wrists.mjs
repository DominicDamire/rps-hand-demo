// Hand landmark zero becomes the shared wrist; body depth remains the depth anchor.
// Assign both hands together so crossed hands cannot claim the same body wrist.
export function sharedWrists(pose,hands){
 const points={...pose?.points},map={L:-1,R:-1},lm=hands?.landmarks||[];
 if(!lm.length)return {pose:pose?{...pose,points}:null,map};
 const distance=(i,s)=>{const p=points[s==='L'?15:16];return p?Math.hypot(lm[i][0].x-p.x,lm[i][0].y-p.y):Infinity;};
 if(lm.length>=2&&points[15]&&points[16]){
  const normal=distance(0,'L')+distance(1,'R'),cross=distance(1,'L')+distance(0,'R');
  map.L=normal<=cross?0:1;map.R=1-map.L;
 }else for(let i=0;i<lm.length;i++){
  const side=points[15]&&points[16]?(distance(i,'L')<distance(i,'R')?'L':'R'):(hands.handedness?.[i]?.[0]?.categoryName==='Left'?'L':'R');
  if(map[side]<0)map[side]=i;
 }
 for(const [side,i] of Object.entries(map))if(i>=0){const id=side==='L'?15:16;points[id]={...points[id],x:lm[i][0].x,y:lm[i][0].y,visibility:1};}
 return {pose:pose?{...pose,points}:null,map};
}
