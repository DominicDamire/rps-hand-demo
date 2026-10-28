// Contact is a visual constraint, not measured monocular depth.
import {imagePalmSize} from './size-wall-depth.mjs';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),add=(a,b)=>a.map((v,i)=>v+b[i]);
const tips=new Set([4,8,12,16,20]);
export function contactSamples(lm,points){
 const samples=lm.map((p,i)=>({image:[p.x,p.y],point:points[i],tip:tips.has(i),key:String(i)}));
 for(let f=0;f<5;f++)for(let k=1;k<4;k++){const a=1+4*f+k-1,b=a+1;samples.push({image:[(lm[a].x+lm[b].x)/2,(lm[a].y+lm[b].y)/2],point:points[a].map((v,i)=>(v+points[b][i])/2),tip:false,key:a+'-'+b});}
 samples.push({image:[(lm[0].x+lm[9].x)/2,(lm[0].y+lm[9].y)/2],point:points[0].map((v,i)=>(v+points[9][i])/2),tip:false,key:'palm'});return samples;
}
export function findTouchPair(left,right,aspect=1,previousKey=null,{rangePercent=18,indexOnly=false,tipsOnly=false,tipGap=.001,assumeIndexContact=false}={}){
 const size=Math.min(imagePalmSize(left.lm,aspect)||0,imagePalmSize(right.lm,aspect)||0);
 if(size<=0)return null;const threshold=size*Math.max(0,Math.min(50,rangePercent))/100,A=contactSamples(left.lm,left.points),B=contactSamples(right.lm,right.points);let best=null;
 if(indexOnly){const a=A[8],b=B[8],gap=Math.hypot((a.image[0]-b.image[0])*aspect,a.image[1]-b.image[1]);return (assumeIndexContact||gap<=threshold*(previousKey==='8:8'?1.5:1))?{a:a.point,b:b.point,key:'8:8',score:gap,gap,surfaceGap:.001}:null;}
 for(const a of A)for(const b of B){if(tipsOnly&&(!a.tip||!b.tip))continue;if(!a.tip&&!b.tip&&!(a.key==='palm'&&b.key==='palm'))continue;
  const gap=Math.hypot((a.image[0]-b.image[0])*aspect,a.image[1]-b.image[1]),key=a.key+':'+b.key;
  if(gap>threshold*(key===previousKey?1.5:1))continue;
  const score=gap*(a.tip&&b.tip?.8:1),candidate={a:a.point,b:b.point,key,score,gap,surfaceGap:a.tip&&b.tip?tipGap:.006};if(key===previousKey)return candidate;if(!best||score<best.score)best=candidate;
 }return best;
}
export function solveTouchDepth(a,b,rootA,rootB,{maxSideChange=.035,surfaceGap=.001}={}){
 if(![a,b,rootA,rootB].every(p=>p?.length===3&&p.every(Number.isFinite))||rootA[2]>=-.04||rootB[2]>=-.04)return null;
 const rayA=mul(rootA,1/-rootA[2]),rayB=mul(rootB,1/-rootB[2]),oppositeB=mul(rayB,-1),difference=sub(a,b);
 // Solve both ray distances independently. Their shared distance must be allowed
 // to change when both model hands are too small/far away to meet on screen.
 const prior=.00001,aa=dot(rayA,rayA)+prior,bb=dot(rayB,rayB)+prior,ab=dot(rayA,oppositeB),ac=-dot(rayA,difference),bc=-dot(oppositeB,difference),det=aa*bb-ab*ab;
 if(det<1e-10)return null;
 const da=(ac*bb-bc*ab)/det,db=(bc*aa-ac*ab)/det;
 const depthA=-rootA[2]+da,depthB=-rootB[2]+db;
 if(depthA<.06||depthB<.06||depthA>2.5||depthB>2.5||depthA/(-rootA[2])<.2||depthB/(-rootB[2])<.2||depthA/(-rootA[2])>4||depthB/(-rootB[2])>4)return null;
 let A=mul(rayA,da),B=mul(rayB,db);
 const residual=sub(add(a,A),add(b,B)),length=Math.hypot(...residual),amount=Math.max(0,length-surfaceGap)/2;
 if(amount>maxSideChange)return null;
 const settle=length?mul(residual,amount/length):[0,0,0];A=sub(A,settle);B=add(B,settle);
 return {A,B,gap:Math.min(length,surfaceGap),depthA,depthB};
}

export function closeContact(a,b,A,B,gap,weight=1){const remaining=sub(add(a,A),add(b,B)),length=Math.hypot(...remaining);if(length<=gap||length<1e-8)return {A:A.slice(),B:B.slice()};const correction=mul(remaining,(length-gap)/(2*length)*Math.max(0,Math.min(1,weight)));return {A:sub(A,correction),B:add(B,correction)};}
