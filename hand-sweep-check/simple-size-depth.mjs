export const EDGES=[[0,5],[0,9],[0,13],[0,17],[5,17]];
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
export function rawPalmSpan(lm,aspect=1){
 if(!(aspect>0)||!EDGES.every(([a,b])=>[lm?.[a],lm?.[b]].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))))return null;
 const value=median(EDGES.map(([a,b])=>Math.hypot((lm[a].x-lm[b].x)*aspect,lm[a].y-lm[b].y)));
 return value>1e-5?value:null;
}
export function palmFacing(world){
 if(![0,5,9,17].every(i=>world?.[i]&&[world[i].x,world[i].y,world[i].z].every(Number.isFinite)))return 0;
 const a=['x','y','z'].map(k=>world[5][k]-world[17][k]),b=['x','y','z'].map(k=>world[9][k]-world[0][k]);
 const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n);
 return length>1e-9?Math.abs(n[2])/length:0;
}
export function sizeDepthSample({landmarks,world,aspect=1,focal,modelSpan,previous=.5,confidence=1}){
 const span=rawPalmSpan(landmarks,aspect),facing=palmFacing(world);
 const valid=confidence>=.5&&span>0&&facing>=.45&&focal>0&&modelSpan>0;
 const estimate=valid?focal*modelSpan/span:previous;
 const usable=valid&&estimate>=.04&&estimate<=4;
 return {depth:usable?estimate:previous,valid:usable,span,facing,held:!usable};
}
