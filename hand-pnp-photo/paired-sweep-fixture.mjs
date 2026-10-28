// Synthetic camera/rig observations with known depths; test fixture only.
export function pairFrame(z,time,renderDepth=.6){
 return ['Left','Right'].map((label,side)=>{
  const sign=side? -1:1,root=-sign*.14,offsets=[[0,0,0]];
  for(let f=0;f<5;f++)for(let k=0;k<4;k++)offsets.push([sign*[.06,.09,.115,.14][k],f===1?0:(f-1)*.014,0]);
  return {label,time,seen:time,confidence:.99,landmarks:offsets.map(o=>({x:.5+(root+o[0])/(2*z),y:.5-o[1]/(2*z),z:0})),points:offsets.map(o=>[root*renderDepth/z+o[0],o[1],-renderDepth])};
 });
}
