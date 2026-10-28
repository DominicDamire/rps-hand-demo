export function paddingPlan(centerX,centerY,width,height){
 const px=centerX<.30||centerX>.70?Math.round(width*.35):0;
 const py=centerY<.30||centerY>.70?Math.round(height*.35):0;
 return {width:width+px,height:height+py,x:centerX<.30?px:0,y:centerY<.30?py:0};
}
export function unpadLandmarks(points,plan,width,height){
 return points.map(p=>({...p,x:(p.x*plan.width-plan.x)/width,y:(p.y*plan.height-plan.y)/height}));
}

const anchors=[33,133,263,362,168,6,1,10,151,109,338,54,284];
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

// Pick strong, spatially separated texture points in the cap above and around
// the MediaPipe face oval. MediaPipe has no hair landmarks, so these points are
// learned from pixels while the face is visible and then move with the outer
// head/hair silhouette during a detector dropout.
export function selectHeadTexturePoints(gray,points,{maxPoints=28,minScore=24}={}){
 if(!gray||!points)return [];
 const outlineIds=[10,151,109,338,67,297,54,284,127,356,234,454,33,263,152];
 const face=outlineIds.map(i=>points[i]).filter(finitePoint);if(face.length<8)return [];
 const xs=face.map(p=>p.x),ys=face.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const fw=maxX-minX,fh=maxY-minY;if(fw<.04||fh<.05)return [];
 const cx=(minX+maxX)/2,cy=minY-.03*fh,rx=.72*fw,ry=.70*fh,{width,height,data}=gray,candidates=[];
 const left=Math.max(3,Math.floor((cx-rx)*width)),right=Math.min(width-4,Math.ceil((cx+rx)*width));
 const top=Math.max(3,Math.floor((minY-.68*fh)*height)),bottom=Math.min(height-4,Math.ceil((minY+.50*fh)*height));
 for(let y=top;y<=bottom;y+=2)for(let x=left;x<=right;x+=2){
  const nx=(x/width-cx)/rx,ny=(y/height-cy)/ry;if(nx*nx+ny*ny>1)continue;
  const score=Math.abs(data[y*width+x+1]-data[y*width+x-1])+Math.abs(data[(y+1)*width+x]-data[(y-1)*width+x]);
  if(score>=minScore)candidates.push({x:x/width,y:y/height,score,px:x,py:y});
 }
 candidates.sort((a,b)=>b.score-a.score);const selected=[];
 for(const p of candidates){if(selected.every(q=>Math.hypot(p.px-q.px,p.py-q.py)>=6))selected.push(p);if(selected.length>=maxPoints)break;}
 return selected.map(({x,y,score})=>({x,y,score}));
}

// Patch correlation bridges brief detector misses at the frame boundary. It only
// estimates image translation from visible facial features; 3D pose stays with
// the perspective solver and its existing plausibility checks.
export function trackPointTranslation(previous,current,points,{radius=3,search=28,minMatches=2,minScore=.68}={}){
 if(!previous||!current||previous.width!==current.width||previous.height!==current.height||!points)return null;
 const {width,height}=previous,matches=[];
 for(const point of points){
  if(!finitePoint(point))continue;
  const x=Math.round(point.x*width),y=Math.round(point.y*height);
  if(x<radius||x>=width-radius||y<radius||y>=height-radius)continue;
  let best={score:-2,dx:0,dy:0};
  for(let dy=-search;dy<=search;dy+=2)for(let dx=-search;dx<=search;dx+=2){
   const qx=x+dx,qy=y+dy;if(qx<radius||qx>=width-radius||qy<radius||qy>=height-radius)continue;
   let sa=0,sb=0,saa=0,sbb=0,sab=0,n=0;
   for(let py=-radius;py<=radius;py++)for(let px=-radius;px<=radius;px++){
    const a=previous.data[(y+py)*width+x+px],b=current.data[(qy+py)*width+qx+px];
    sa+=a;sb+=b;saa+=a*a;sbb+=b*b;sab+=a*b;n++;
   }
   const denominator=Math.sqrt(Math.max(1e-9,(n*saa-sa*sa)*(n*sbb-sb*sb)));
   const score=(n*sab-sa*sb)/denominator;if(score>best.score)best={score,dx,dy};
  }
  if(best.score>minScore)matches.push(best);
 }
 if(matches.length<minMatches)return null;
 const dx=median(matches.map(m=>m.dx)),dy=median(matches.map(m=>m.dy));
 const consistent=matches.filter(m=>Math.hypot(m.dx-dx,m.dy-dy)<=4);
 if(consistent.length<minMatches)return null;
 return {dx:median(consistent.map(m=>m.dx)),dy:median(consistent.map(m=>m.dy)),quality:median(consistent.map(m=>m.score)),matches:consistent.length};
}
export function trackFeatureTranslation(previous,current,points,{anchorIds=anchors,...options}={}){
 return trackPointTranslation(previous,current,anchorIds.map(id=>points?.[id]).filter(Boolean),options);
}
