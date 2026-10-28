import {centreFingerShells} from './centre-shell.mjs';
import {restoreOriginalShell} from './original-shell.mjs?v=flat11';
import {restorePalmRelief} from './palm-relief.mjs?v=palm4';
import * as T from 'three';
import {buildTips} from './contact.mjs?v=photo1';
// Pixel centres read from the user's first landmark screenshot, not a metric 3D scan.
export const PHOTO_POINTS=[[401,838],[340.8,819.6],[292.8,771.8],[260,725.8],[225.2,694.4],[316.8,690],[296.4,628.2],[286.4,585.2],[279.5,547.5],[354.2,678.4],[338.5,609.5],[329.5,561.5],[323.5,519.5],[391.5,683],[388.4,617.2],[384.4,572.2],[379,533.2],[430.4,699.2],[438.6,648.2],[442.6,612.8],[443,578]];
export const COMPARISON_POINTS=[[381.2,803],[315.38,799.25],[269.17,773.83],[235.89,749.78],[201,731.53],[292.6,692.8],[266.83,645.83],[248.4,612.2],[235.38,585.38],[323.6,680.8],[304.17,625.17],[289.83,587.83],[278.62,555.62],[356.6,679.8],[344.4,626.2],[333.4,591.2],[323.38,561.38],[390.6,685.2],[393.5,644],[396.33,614.5],[395.25,585.33]];
const fingers=['Thumb','Index','Middle','Ring','Pinky'];
export function fitPhotoHand(rig,{preservePalmRelief=false,referencePoints=PHOTO_POINTS}={}){
 const oldTips=buildTips(rig),old={};for(const [n,r]of Object.entries(rig.rest))old[n]=r.world.clone();
 rig.root.updateMatrixWorld(true);
 const snapshots=new Map();for(const m of rig.parts){if(!/^[RL](Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name))continue;const a=m.geometry.attributes.position;snapshots.set(m,Array.from({length:a.count},(_,i)=>new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld)));}
 const originals=new Map([...snapshots.keys()].map(m=>[m,{geometry:m.geometry,world:m.matrixWorld.clone()}]));
 const targets={},report={},allTargets={};let rightAnchor=null,rightTargets=null;
 for(const s of ['R','L']){
  const wrist=old[s+'Hand'],middle=old[s+'Middle1'],along=middle.clone().sub(wrist).normalize();
  const across=old[s+'Index1'].clone().sub(old[s+'Pinky1']);across.addScaledVector(along,-across.dot(along)).normalize();const normal=new T.Vector3().crossVectors(across,along).normalize();
  const palms=[...snapshots.keys()].filter(m=>m.name.startsWith(s+'Hand__palm')).sort((a,b)=>new T.Box3().setFromPoints(snapshots.get(b)).getSize(new T.Vector3()).length()-new T.Box3().setFromPoints(snapshots.get(a)).getSize(new T.Vector3()).length());
  if(!palms.length)throw Error('Missing outer palm geometry');
  const verts=snapshots.get(palms[0]),sorted=verts.map(p=>({p,d:p.clone().sub(wrist).dot(along)})).sort((a,b)=>a.d-b.d),cut=sorted[0].d+.003;
  const bottom=sorted.filter(p=>p.d<=cut).map(r=>r.p.dot(across));
  // A line through the actual palm shell, just inside its proximal edge.
  // Surface extrema, not a vertex-density weighted centroid.
  const anchor=wrist.clone().addScaledVector(along,cut-.0015);
  anchor.addScaledVector(across,(Math.min(...bottom)+Math.max(...bottom))/2-anchor.dot(across));
  const section=surfaceSection(palms[0],verts,anchor,across,along,normal);
  if(!section)throw Error('Cannot locate paired palm-base surfaces');
  anchor.addScaledVector(normal,(section[0]+section[1])/2-anchor.dot(normal));
  // Both hands share the same mirrored anchor and dimensions.
  if(s==='R')rightAnchor=anchor.clone();else anchor.copy(rightAnchor).setX(-rightAnchor.x);
  const length=middle.clone().sub(anchor).dot(along),uv=referencePoints.map(([x,y])=>new T.Vector2(x-referencePoints[0][0],referencePoints[0][1]-y));
  const ey=uv[9].clone().normalize(),ex=new T.Vector2(-ey.y,ey.x),pixels=uv[9].length(),points=[];
  for(let i=0;i<21;i++){
   // The measured flat reference is the internal centre plane.
   points.push(anchor.clone().addScaledVector(across,uv[i].dot(ex)*length/pixels).addScaledVector(along,uv[i].dot(ey)*length/pixels));
  }
  if(s==='R')rightTargets=points.map(p=>p.clone());else for(let i=0;i<21;i++)points[i].copy(rightTargets[i]).setX(-rightTargets[i].x);
  allTargets[s]=points;targets[s+'Hand']=points[0];
  for(let f=0;f<5;f++)for(let k=1;k<=3;k++)targets[s+fingers[f]+k]=points[1+4*f+k-1];
  report[s]={wristAnchorShiftMm:anchor.distanceTo(wrist)*1000,points:points.map(p=>p.toArray()),metresPerPixel:length/pixels,oldWrist:wrist.toArray(),palmSurfacePair:section,centrePlane:normal.toArray(),cameraRight:across.clone().multiplyScalar(ex.x).addScaledVector(along,ey.x).toArray(),cameraUp:across.clone().multiplyScalar(ex.y).addScaledVector(along,ey.y).toArray()};
  // Deform only the outer palm once. Mechanical wrist hardware stays at its original rest location.
  const flatten=p=>p.clone().addScaledVector(normal,anchor.dot(normal)-p.dot(normal));
  const from=[anchor,...fingers.map(f=>flatten(old[s+f+'1']))],to=[points[0],...fingers.map((f,i)=>points[1+4*i])];
  for(const [m,vertices]of snapshots){if(!m.name.startsWith(s))continue;
   // Preserve each front/back thickness, but centre the actual shell on the
   // joint plane. Both surfaces at the same projected coordinate receive the
   // same translation; this never derives joint positions from the mesh.
   if(!m.name.startsWith(s+'Hand')||m.name.startsWith(s+'Hand__palm')){
    const original=vertices.map(v=>v.clone());
    for(let vi=0;vi<vertices.length;vi++){
     const pair=surfaceSection(m,original,original[vi],across,along,normal);
     if(pair)vertices[vi].addScaledVector(normal,anchor.dot(normal)-(pair[0]+pair[1])/2);
    }
   }
   if(m.name.startsWith(s+'Hand__palm'))for(const v of vertices){let nearest=-1;const weights=from.map((p,i)=>{const d=v.distanceToSquared(p);if(d<1e-12)nearest=i;return 1/Math.max(1e-12,d*d);});const sum=weights.reduce((a,b)=>a+b,0),delta=new T.Vector3();for(let i=0;i<from.length;i++)delta.addScaledVector(to[i].clone().sub(from[i]),nearest>=0?Number(i===nearest):weights[i]/sum);v.add(delta);}
   else if(!m.name.startsWith(s+'Hand')){
    const match=m.name.match(/^[RL](Thumb|Index|Middle|Ring|Pinky)([123])__/);if(!match)continue;
    const f=fingers.indexOf(match[1]),k=+match[2],a=flatten(old[s+match[1]+k]),b=flatten(k<3?old[s+match[1]+(k+1)]:old[s+match[1]+k].clone().add(oldTips[s+match[1]])),newA=points[1+4*f+k-1],newB=points[1+4*f+k];
    const axis=b.clone().sub(a),oldLength=axis.length();axis.normalize();const next=newB.clone().sub(newA),ratio=next.length()/oldLength,rotation=new T.Quaternion().setFromUnitVectors(axis,next.normalize());
    for(const v of vertices){v.sub(a);v.addScaledVector(axis,v.dot(axis)*(ratio-1)).applyQuaternion(rotation).add(newA);}
   }
  }
 }
 for(const [n,p]of Object.entries(targets))rig.rest[n].world.copy(p);
 for(const [n,p]of Object.entries(targets)){const j=rig.joints[n],parent=rig.rest[j.parent.name]?.world;j.position.copy(p);if(parent)j.position.sub(parent);}
 rig.root.updateMatrixWorld(true);
 for(const [m,vertices]of snapshots){
  const side=m.name[0],normal=new T.Vector3().fromArray(report[side].centrePlane),origin=allTargets[side][0];
  // Build matching front/back triangulation so interpolation, not just vertices,
  // is exactly centred through the thickness. Keep the original silhouette.
  const centred=!m.name.startsWith(side+'Hand')||m.name.startsWith(side+'Hand__palm');
  const index=m.geometry.index,world=[];
  for(let t=0;t<(index?index.count:vertices.length);t+=3){
   const triangle=[0,1,2].map(k=>vertices[index?index.getX(t+k):t+k]);
   if(!centred){world.push(...triangle);continue;}
   let clipped=[];
   for(let k=0;k<3;k++){
    const a=triangle[k],b=triangle[(k+1)%3],da=a.clone().sub(origin).dot(normal),db=b.clone().sub(origin).dot(normal);
    if(da>=0)clipped.push(a);
    if((da<0)!==(db<0))clipped.push(a.clone().lerp(b,da/(da-db)));
   }
   for(let k=1;k<clipped.length-1;k++){
    const tri=[clipped[0],clipped[k],clipped[k+1]];world.push(...tri);
    world.push(...[tri[2],tri[1],tri[0]].map(v=>v.clone().addScaledVector(normal,-2*v.clone().sub(origin).dot(normal))));
   }
  }
  const inverse=m.parent.matrixWorld.clone().invert();
  m.geometry=new T.BufferGeometry().setFromPoints(world.map(p=>p.clone().applyMatrix4(inverse)));
  m.position.set(0,0,0);m.quaternion.identity();m.scale.set(1,1,1);m.updateMatrix();m.geometry.computeVertexNormals();m.geometry.computeBoundingBox();m.geometry.computeBoundingSphere();delete m.userData.directRestMatrix;
 }

 rig.root.updateMatrixWorld(true);rig.photoReference={report,targets:allTargets};if(preservePalmRelief)restorePalmRelief(rig,old,oldTips,surfaceSection);restoreOriginalShell(rig,originals,old,oldTips,surfaceSection);centreFingerShells(rig,surfaceSection);return report;
}

// Intersect the complete triangulated shell along its thickness axis.
// Barycentric interpolation includes edges, and ignores edge-on triangles.
export function surfaceSection(mesh,vertices,point,x,y,z){
 const px=point.dot(x),py=point.dot(y),index=mesh.geometry.index;
 const count=index?index.count:vertices.length;let lo=Infinity,hi=-Infinity;
 for(let t=0;t<count;t+=3){
  const a=vertices[index?index.getX(t):t],b=vertices[index?index.getX(t+1):t+1],c=vertices[index?index.getX(t+2):t+2];
  const ax=a.dot(x),ay=a.dot(y),bx=b.dot(x),by=b.dot(y),cx=c.dot(x),cy=c.dot(y);
  if(px<Math.min(ax,bx,cx)-1e-8||px>Math.max(ax,bx,cx)+1e-8||py<Math.min(ay,by,cy)-1e-8||py>Math.max(ay,by,cy)+1e-8)continue;
  const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-14)continue;
  const u=((by-cy)*(px-cx)+(cx-bx)*(py-cy))/den,v=((cy-ay)*(px-cx)+(ax-cx)*(py-cy))/den,w=1-u-v;
  if(Math.min(u,v,w)<-1e-5)continue;
  const d=u*a.dot(z)+v*b.dot(z)+w*c.dot(z);lo=Math.min(lo,d);hi=Math.max(hi,d);
 }
 return Number.isFinite(lo)?[lo,hi]:null;
}
