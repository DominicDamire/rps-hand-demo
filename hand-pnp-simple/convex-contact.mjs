const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],triple=(a,b,c)=>cross(cross(a,b),c);
function support(vertices,d){let best=vertices[0],score=-Infinity;for(const v of vertices){const n=dot(v,d);if(n>score){score=n;best=v;}}return best;}
function intersects(A,B){
 const supportPair=d=>sub(support(A,d),support(B,mul(d,-1)));let d=[1,0,0],simplex=[supportPair(d)];d=mul(simplex[0],-1);
 for(let iteration=0;iteration<40;iteration++){
  if(dot(d,d)<1e-18)return true;const a=supportPair(d);if(dot(a,d)<-1e-10)return false;simplex.unshift(a);const ao=mul(a,-1);
  const line=()=>{const ab=sub(simplex[1],a);if(dot(ab,ao)>0)d=triple(ab,ao,ab);else{simplex=[a];d=ao;}};
  if(simplex.length===2){line();continue;}
  if(simplex.length===3){const b=simplex[1],c=simplex[2],ab=sub(b,a),ac=sub(c,a),abc=cross(ab,ac);
   if(dot(cross(abc,ac),ao)>0){if(dot(ac,ao)>0){simplex=[a,c];d=triple(ac,ao,ac);}else{simplex=[a,b];line();}}
   else if(dot(cross(ab,abc),ao)>0){simplex=[a,b];line();}
   else if(dot(abc,ao)>0)d=abc;else{simplex=[a,c,b];d=mul(abc,-1);}continue;
  }
  const [p,b,c,e]=simplex;let outside=false;
  for(const [u,v,opposite] of [[b,c,e],[c,e,b],[e,b,c]]){let n=cross(sub(u,p),sub(v,p));if(dot(n,sub(opposite,p))>0)n=mul(n,-1);if(dot(n,ao)>1e-10){simplex=[p,u,v];d=n;outside=true;break;}}
  if(!outside)return true;
 }return false;
}
export function convexPenetration(A,B,padding=.0003){
 if(!A.vertices?.length||!B.vertices?.length)return null;
 const bounds=h=>h.bounds||[0,1,2].map(i=>[Math.min(...h.vertices.map(v=>v[i])),Math.max(...h.vertices.map(v=>v[i]))]);
 const ba=bounds(A),bb=bounds(B);for(let i=0;i<3;i++)if(ba[i][1]<=bb[i][0]||bb[i][1]<=ba[i][0])return null;
 let best=null;for(const n of [...A.normals,...B.normals]){let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;for(const p of A.vertices){const d=dot(p,n);amin=Math.min(amin,d);amax=Math.max(amax,d);}for(const p of B.vertices){const d=dot(p,n);bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}if(amax<=bmin||bmax<=amin)return null;const negative=bmin-amax,positive=bmax-amin,d=Math.abs(negative)<positive?negative:positive;if(!best||Math.abs(d)<best.depth)best={depth:Math.abs(d),delta:mul(n,d+Math.sign(d)*padding)};}
 return best&&intersects(A.vertices,B.vertices)?best:null;
}

// Translate a contacting pair together along camera-forward (+Z). This preserves
// fingertip contact and avoids competing left/right collision corrections.
export function forwardClearance(shapes,obstacles){
 const moved=(a,z)=>({...a,vertices:a.vertices.map(p=>[p[0],p[1],p[2]+z]),bounds:undefined});
 const overlaps=z=>shapes.some(a=>obstacles.some(b=>convexPenetration(moved(a,z),b)));
 if(!overlaps(0))return 0;
 const maxZ=Math.max(...obstacles.flatMap(h=>h.vertices.map(p=>p[2]))),minZ=Math.min(...shapes.flatMap(h=>h.vertices.map(p=>p[2])));
 let lo=0,hi=Math.max(.001,maxZ-minZ+.001);
 // Find the first clear position, then refine that boundary (not a head-wide wall).
 const step=hi/64;for(let z=step;z<=hi;z+=step){if(!overlaps(z)){hi=z;break;}lo=z;}
 for(let i=0;i<16;i++){const mid=(lo+hi)/2;if(overlaps(mid))lo=mid;else hi=mid;}
 return hi+.0003;
}

// A camera-visible hand must not tunnel through the head between frames.
// Find any head shell crossed on a +Z path, even if the input hand already
// landed completely behind it. XY-separated side/top poses remain untouched.
export function frontClearance(shapes,obstacles){
 let clearance=0;
 for(const a of shapes)for(const b of obstacles){
  const bounds=h=>h.bounds||[0,1,2].map(i=>[Math.min(...h.vertices.map(p=>p[i])),Math.max(...h.vertices.map(p=>p[i]))]);
  const A=bounds(a),B=bounds(b);if([0,1].some(i=>A[i][1]<=B[i][0]||B[i][1]<=A[i][0])||A[2][0]>=B[2][1])continue;
  let lo=0,hi=Infinity;
  for(const n of [...a.normals,...b.normals]){
   let amin=Infinity,amax=-Infinity,bmin=Infinity,bmax=-Infinity;for(const p of a.vertices){const d=dot(p,n);amin=Math.min(amin,d);amax=Math.max(amax,d);}for(const p of b.vertices){const d=dot(p,n);bmin=Math.min(bmin,d);bmax=Math.max(bmax,d);}
   const low=bmin-amax,high=bmax-amin,z=n[2];
   if(Math.abs(z)<1e-10){if(low>=0||high<=0){hi=-1;break;}continue;}
   const x=low/z,y=high/z;lo=Math.max(lo,Math.min(x,y));hi=Math.min(hi,Math.max(x,y));if(lo>=hi)break;
  }
  if(!(hi>lo&&Number.isFinite(hi)))continue;
  // Conservative face-axis interval: choosing its front exit cannot leave
  // a real intersection behind. It may add clearance near a hull silhouette.
  clearance=Math.max(clearance,hi+.0003);
 }
 return clearance;
}

// Once any exterior pieces intersect, choose a separating plane for the
// complete compounds. A local finger push must not deepen a second overlap.
export function separateHandShells(A,B){
 if(!A.some(a=>B.some(b=>convexPenetration(a,b))))return null;
 const bounds=S=>[0,1,2].map(k=>{let lo=Infinity,hi=-Infinity;for(const h of S)for(const p of h.vertices){lo=Math.min(lo,p[k]);hi=Math.max(hi,p[k]);}return [lo,hi];});
 const a=bounds(A),b=bounds(B);let best=null;
 for(let k=0;k<3;k++){const sign=a[k][0]+a[k][1]>=b[k][0]+b[k][1]?1:-1;
  const distance=(sign>0?b[k][1]-a[k][0]:a[k][1]-b[k][0])+.0003;
  if(distance>0&&(!best||distance<best.distance)){const delta=[0,0,0];delta[k]=sign*distance;best={delta,distance};}
 }
 return best;
}
