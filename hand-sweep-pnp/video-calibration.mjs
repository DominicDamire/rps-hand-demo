import {imagePalmSize} from './size-wall-depth.mjs';
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
export function fitVideoCalibration(rows){
 const valid=rows.filter(r=>r.sizeL>0&&r.sizeR>0&&r.zL>0&&r.zR>0);
 if(valid.length<20)return null;
 const far=[...valid].sort((a,b)=>(b.zL+b.zR)-(a.zL+a.zR)).slice(0,Math.max(10,Math.floor(valid.length*.25)));
 const ratios=far.map(r=>r.neckRatio).filter(v=>Number.isFinite(v)&&v>.25&&v<4);
 const curves={};
 for(const side of ['L','R']){const pairs=valid.map(r=>[1/r['size'+side],r['z'+side]]);let sw=0,sx=0,sy=0,sxx=0,sxy=0;for(const [x,y]of pairs){sw++;sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}const det=sw*sxx-sx*sx;if(det<1e-8)return null;const b=(sw*sxy-sx*sy)/det,a=(sy-b*sx)/sw;if(b<=0)return null;curves[side]={a,b};}
 return {curves,...fitSpatial(valid),headScale:ratios.length>=8?median(ratios):1,headSamples:ratios.length,frames:valid.length};
}
export function videoDepth(fit,side,size,fallback){const c=fit?.curves?.[side],z=c&&size>0?c.a+c.b/size:NaN;return Number.isFinite(z)&&z>.06&&z<2.5?z:fallback;}

function solve(a,b){const m=a.map((r,i)=>[...r,b[i]]),n=b.length;for(let k=0;k<n;k++){let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(m[i][k])>Math.abs(m[pivot][k]))pivot=i;if(Math.abs(m[pivot][k])<1e-12)return null;[m[k],m[pivot]]=[m[pivot],m[k]];const d=m[k][k];for(let j=k;j<=n;j++)m[k][j]/=d;for(let i=0;i<n;i++)if(i!==k){const d=m[i][k];for(let j=k;j<=n;j++)m[i][j]-=d*m[k][j];}}return m.map(r=>r[n]);}
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export function spatialFeatures(p,lm,sourceAspect,viewAspect,size=imagePalmSize(lm,sourceAspect)){
 if(!p?.[17]||!lm?.[17]||!size)return null;
 const w=Math.min(1,sourceAspect/viewAspect),h=Math.min(1,viewAspect/sourceAspect),tan=Math.tan(Math.PI/6);
 const rays=lm.map(v=>[(v.x-.5)*w*2*tan*viewAspect,(.5-v.y)*h*2*tan]),o=p.map(v=>v.map((x,k)=>x-p[0][k]));let aa=0,ab=0;
 for(const i of [5,9,13,17])for(let k=0;k<2;k++){const a=rays[i][k]-rays[0][k],b=o[i][k]+rays[i][k]*o[i][2];aa+=a*a;ab+=a*b;}
 if(aa<1e-9)return null;const d=ab/aa,a=o[5].map((v,k)=>v-o[17][k]),b=o[9],normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...normal);if(length<1e-9)return null;const n=normal.map(v=>v/length);
 const f=[1,1/size,d,...n,...n.map(v=>d*v)];return f.every(Number.isFinite)?f:null;
}
function regress(features,depths,indices,cols,ridge){const mean=cols.map(c=>indices.reduce((s,i)=>s+features[i][c],0)/indices.length),std=cols.map((c,j)=>Math.sqrt(indices.reduce((s,i)=>s+(features[i][c]-mean[j])**2,0)/indices.length));mean[0]=0;std[0]=1;for(let j=0;j<std.length;j++)std[j]=Math.max(1e-8,std[j]);const n=cols.length,A=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?Math.max(ridge,1e-8):0)),B=Array(n).fill(0);for(const i of indices){const x=cols.map((c,j)=>(features[i][c]-mean[j])/std[j]);for(let j=0;j<n;j++){B[j]+=x[j]*depths[i];for(let k=0;k<n;k++)A[j][k]+=x[j]*x[k];}}const beta=solve(A,B);return beta?{cols,mean,std,beta}:null;}
function predict(model,f){return dot(model.beta,model.cols.map((c,j)=>(f[c]-model.mean[j])/model.std[j]));}
function fitSpatial(rows){
 if(rows.length<60||rows.some(r=>!r.baseline||!r.landmarks))return {};
 const features={};for(const s of ['L','R'])features[s]=rows.map(r=>spatialFeatures(r.baseline[s],r.landmarks[s],r.sourceAspect,r.viewAspect,r['size'+s]));if(Object.values(features).some(fs=>fs.some(f=>!f)))return {};
 const training=rows.map((_,i)=>i).filter(i=>Math.floor(i/15)%3!==1),validation=rows.map((_,i)=>i).filter(i=>Math.floor(i/15)%3===1),candidates=[];
 for(const [name,cols]of [['size',[0,1]],['projection',[0,2]],['combined',[0,1,2]],['orientation',[0,1,2,3,4,5]],['orientation-depth',[0,1,2,3,4,5,6,7,8]]])for(const ridge of [.001,.01,.1,1]){
  const models={};for(const s of ['L','R'])models[s]=regress(features[s],rows.map(r=>r['z'+s]),training,cols,ridge);if(!models.L||!models.R)continue;
  const errors=validation.map(i=>{const tips=['L','R'].map(s=>{const p=rows[i].baseline[s],d=predict(models[s],features[s][i]);if(!Number.isFinite(d)||d<.06||d>2.5)return null;return p[8].map((v,k)=>v+p[0][k]/-p[0][2]*(d+p[0][2]));});return tips.some(p=>!p)?1e9:Math.hypot(...tips[0].map((v,k)=>v-tips[1][k]))*1000;}).sort((a,b)=>a-b);
  candidates.push({name,ridge,models,median:errors[Math.floor(errors.length/2)],p95:errors[Math.floor((errors.length-1)*.95)],max:errors.at(-1)});
 }
 candidates.sort((a,b)=>a.p95-b.p95);const best=candidates[0];return best?{models:best.models,comparison:{selected:best.name,ridge:best.ridge,training:training.length,validation:validation.length,candidates:candidates.map(({models,...r})=>r)}}:{};
}
export function calibratedPlacement(fit,side,points,lm,sourceAspect,viewAspect,fallback){
 const f=spatialFeatures(points,lm,sourceAspect,viewAspect),m=fit?.models?.[side];const d=m&&f?predict(m,f):videoDepth(fit,side,imagePalmSize(lm,sourceAspect),fallback);
 return Number.isFinite(d)&&d>.06&&d<2.5?d:fallback;
}
