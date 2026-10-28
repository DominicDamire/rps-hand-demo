// Palm placement supplies camera depth. Finger articulation must never be
// explained by translating the entire hand along Z. Wrist and base knuckles refine
// XY alignment at that fixed depth; camera-pixel residuals are robustly weighted.
export function fitWholeHand(points,lm,aspect,focal){
 if(!points?.length||!lm||!(aspect>0&&focal>0))return null;
 const root=points[0];if(!root?.every(Number.isFinite)||-root[2]<.04||-root[2]>4)return null;
 const palm=new Set([0,5,9,13,17]),rows=[];
 for(const i of palm){const p=points[i],l=lm[i];if(!p?.every(Number.isFinite)||!l||!Number.isFinite(l.x)||!Number.isFinite(l.y)||l.x<-.04||l.x>1.04||l.y<-.04||l.y>1.04||p[2]>=-.01)continue;
  const z=-p[2],x=(l.x-.5)*aspect/focal*z-p[0],y=(.5-l.y)/focal*z-p[1];rows.push({x,y,z,w:1});
 }
 if(rows.length<4)return null;
 let x=0,y=0;
 for(let iteration=0;iteration<3;iteration++){let sum=0,sx=0,sy=0;
  for(const r of rows){const error=Math.hypot(x-r.x,y-r.y)*focal/r.z,w=r.w*Math.min(1,.015/Math.max(error,1e-9))/(r.z*r.z);sum+=w;sx+=w*r.x;sy+=w*r.y;}
  if(!(sum>0))return null;x=sx/sum;y=sy/sum;
 }
 return Number.isFinite(x)&&Number.isFinite(y)?[x,y,0]:null;
}
