import {cameraPosition,projectCamera} from './projection.mjs';

const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const length=a=>Math.hypot(...a),unit=(a,fallback=[0,1,0])=>length(a)>1e-10?scale(a,1/length(a)):fallback;
const distance=(a,b)=>length(sub(a,b));

// Intersect a camera ray with a sphere whose radius is the photo bone length.
// Both roots are valid geometric possibilities; the tracker provides the sign cue.
export function segmentCandidates(base,uv,boneLength,aspect){
 const ray=unit(cameraPosition(uv,1,aspect)),along=dot(base,ray);
 const closest=scale(ray,along),disc=boneLength**2-distance(closest,base)**2;
 if(disc>=-1e-12){
  const root=Math.sqrt(Math.max(0,disc));
  const candidates=[along-root,along+root].filter(t=>t>0&&-ray[2]*t>.005).map(t=>scale(ray,t));
  if(candidates.length)return candidates;
 }
 // No exact intersection: keep the physical length and expose the image error.
 const direction=unit(sub(closest,base),unit(sub(scale(ray,Math.max(along,.01)),base)));
 return [add(base,scale(direction,boneLength))];
}

export function liftFinger({root,observed,lengths,hints,previous,aspect}){
 const image=observed.map(p=>projectCamera(p,aspect));
 let paths=[{chain:[root.slice()],score:0}];
 for(let k=1;k<4;k++){
  const next=[],L=lengths[k-1],hint=unit(sub(hints[k],hints[k-1]));
  for(const path of paths){
   const base=path.chain.at(-1),uv=projectCamera(base,aspect);
   const target={x:uv.x+image[k].x-image[k-1].x,y:uv.y+image[k].y-image[k-1].y};
   for(const point of segmentCandidates(base,target,L,aspect)){
    const dir=unit(sub(point,base)),projected=projectCamera(point,aspect);
    let score=path.score+(dir[2]-hint[2])**2;
    if(previous){const old=unit(sub(previous[k],previous[k-1]));score+=.06*(dir[2]-old[2])**2;}
    if(k>1){
     const prevDir=unit(sub(base,path.chain[k-2])),prevHint=unit(sub(hints[k-1],hints[k-2]));
     score+=.25*(dot(prevDir,dir)-dot(prevHint,hint))**2;
    }
    score+=4*((projected.x-target.x)**2+(projected.y-target.y)**2);
    next.push({chain:[...path.chain,point],score});
   }
  }
  paths=next.sort((a,b)=>a.score-b.score).slice(0,8);
 }
 return paths[0].chain;
}

function reach(chain,lengths,target){
 const root=chain[0].slice(),total=lengths.reduce((a,b)=>a+b,0),axis=unit(sub(target,root));
 if(distance(root,target)>=total){for(let i=1;i<4;i++)chain[i]=add(chain[i-1],scale(axis,lengths[i-1]));return;}
 // A perfectly straight chain needs a tiny bend seed to solve a shorter reach.
 const offAxis=chain.slice(1,3).some(p=>length(sub(sub(p,root),scale(axis,dot(sub(p,root),axis))))>1e-7);
 if(!offAxis){
  const candidate=Math.abs(axis[2])<.8?[0,0,1]:[0,1,0];
  const bend=unit(sub(candidate,scale(axis,dot(candidate,axis))));
  chain[1]=add(chain[1],scale(bend,total*.02));chain[2]=add(chain[2],scale(bend,total*.02));
 }
 for(let pass=0;pass<64;pass++){
  chain[3]=target.slice();
  for(let i=2;i>=0;i--)chain[i]=add(chain[i+1],scale(unit(sub(chain[i],chain[i+1])),lengths[i]));
  chain[0]=root.slice();
  for(let i=1;i<4;i++)chain[i]=add(chain[i-1],scale(unit(sub(chain[i],chain[i-1])),lengths[i-1]));
  if(distance(chain[3],target)<1e-6)break;
 }
}

// Symmetric contact correction. Roots and bone lengths remain fixed.
export function closeFingertips(a,b,la,lb){
 a=a.map(p=>p.slice());b=b.map(p=>p.slice());
 const ra=la.reduce((s,v)=>s+v,0),rb=lb.reduce((s,v)=>s+v,0);
 let target=scale(add(a[3],b[3]),.5);
 // Project the target into both reach spheres before solving the chains.
 for(let pass=0;pass<24;pass++)for(const [root,radius]of [[a[0],ra],[b[0],rb]]){
  if(distance(root,target)>radius)target=add(root,scale(unit(sub(target,root)),radius));
 }
 for(let pass=0;pass<8;pass++){
  reach(a,la,target);reach(b,lb,target);
  if(distance(a[3],b[3])<.00005)break;
  target=scale(add(a[3],b[3]),.5);
 }
 return {a,b,gap:distance(a[3],b[3]),reachable:distance(a[0],b[0])<=ra+rb};
}

export function updateOKContact(active,lm,width,height,enabled,enterPixels,releasePixels){
 if(!enabled||!lm)return false;
 const gap=Math.hypot((lm[4].x-lm[8].x)*width,(lm[4].y-lm[8].y)*height);
 return gap<=(active?Math.max(enterPixels,releasePixels):enterPixels);
}
