import {cutClosedPalm} from './cut-palm.mjs?v=cut10';
import * as T from 'three';
const fingers=['Thumb','Index','Middle','Ring','Pinky'];
// Retain authored finger surfaces. Remove the old palm thumb socket and
// cut/cap the adjoining palm edge once, before live tracking.
export function restoreOriginalShell(rig,originals,old,oldTips,section){
 for(const s of ['R','L']){
  const palmParts=[...originals.keys()].filter(m=>m.name.startsWith(s+'Hand__palm')).sort((a,b)=>originals.get(b).geometry.attributes.position.count-originals.get(a).geometry.attributes.position.count);
  const mainPalm=palmParts[0];
  const ref=rig.photoReference.targets[s],origin=ref[0],y=old[s+'Middle1'].clone().sub(old[s+'Hand']).normalize(),x=old[s+'Index1'].clone().sub(old[s+'Pinky1']);x.addScaledVector(y,-x.dot(y)).normalize();const z=new T.Vector3().crossVectors(x,y).normalize();
  let xx=0,xy=0,yy=0,bxx=0,bxy=0,byx=0,byy=0;
  for(const [i,f]of [[5,'Index'],[9,'Middle'],[13,'Ring'],[17,'Pinky']]){const a=old[s+f+'1'].clone().sub(origin),b=ref[i].clone().sub(origin),u=a.dot(x),v=a.dot(y);xx+=u*u;xy+=u*v;yy+=v*v;bxx+=u*b.dot(x);bxy+=v*b.dot(x);byx+=u*b.dot(y);byy+=v*b.dot(y);}
  const det=xx*yy-xy*xy;if(Math.abs(det)<1e-12)throw Error('Invalid original palm frame');
  const local=new T.Matrix4().set((bxx*yy-bxy*xy)/det,(bxy*xx-bxx*xy)/det,0,0,(byx*yy-byy*xy)/det,(byy*xx-byx*xy)/det,0,0,0,0,1,0,0,0,0,1),basis=new T.Matrix4().makeBasis(x,y,z);
  const palm=new T.Matrix4().makeTranslation(...origin.toArray()).multiply(basis).multiply(local).multiply(basis.clone().invert()).multiply(new T.Matrix4().makeTranslation(...origin.clone().negate().toArray()));
  for(const [m,source]of originals){if(!m.name.startsWith(s))continue;let transform=new T.Matrix4();const match=m.name.match(/^[RL](Thumb|Index|Middle|Ring|Pinky)([123])__/);
   if(match){const f=match[1],k=Number(match[2]),i=1+fingers.indexOf(f)*4+k-1,a=old[s+f+k],b=k<3?old[s+f+(k+1)]:a.clone().add(oldTips[s+f]),axis=b.clone().sub(a),target=ref[i+1].clone().sub(ref[i]),ratio=target.length()/axis.length();axis.normalize();const rot=new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),axis));const stretch=rot.clone().multiply(new T.Matrix4().makeScale(1,1,ratio)).multiply(rot.clone().invert());transform.makeTranslation(...ref[i].toArray()).multiply(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(axis,target.normalize()))).multiply(stretch).multiply(new T.Matrix4().makeTranslation(...a.clone().negate().toArray()));}
   else if(m.name.startsWith(s+'Hand__palm'))transform.copy(palm);
   const full=m.parent.matrixWorld.clone().invert().multiply(transform).multiply(source.world);
   m.geometry.dispose();m.geometry=source.geometry.clone();m.geometry.applyMatrix4(full);
   if(m.name.startsWith(s+'Hand__palm')&&m!==mainPalm){
    m.geometry.dispose();m.geometry=new T.BufferGeometry();m.geometry.setAttribute('position',new T.Float32BufferAttribute([],3));m.geometry.setAttribute('normal',new T.Float32BufferAttribute([],3));m.geometry.setIndex([]);m.geometry.userData.cut={removed:true,socketRemoved:true};
   }else if(m===mainPalm){
    const a=ref[1].clone().sub(origin),b=ref[5].clone().sub(origin),slope=(b.dot(x)+.005-(a.dot(x)-.008))/(b.dot(y)-a.dot(y));
    const normal=x.clone().addScaledVector(y,-slope).normalize();
    const anchor=origin.clone().addScaledVector(x,a.dot(x)-.008).addScaledVector(y,a.dot(y));
    const plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,anchor).applyMatrix4(m.parent.matrixWorld.clone().invert());
    const cut=cutClosedPalm(m.geometry,plane);m.geometry.dispose();m.geometry=cut;
    // Centre the authored palm before symmetric depth clipping. Otherwise a
    // thin face on one side of the wrist survives clipping off-centre.
    const frame=rig.photoReference.report[s],cx=new T.Vector3().fromArray(frame.cameraRight),cy=new T.Vector3().fromArray(frame.cameraUp),cz=new T.Vector3().crossVectors(cx,cy).normalize();
    const pa=m.geometry.attributes.position,world=Array.from({length:pa.count},(_,i)=>new T.Vector3().fromBufferAttribute(pa,i).applyMatrix4(m.parent.matrixWorld));
    const pair=section(m,world,origin,cx,cy,cz);
    if(!pair)throw Error('Missing palm shell at wrist');
    const shift=origin.dot(cz)-(pair[0]+pair[1])/2,inv=m.parent.matrixWorld.clone().invert();
    for(let i=0;i<world.length;i++){const p=world[i].addScaledVector(cz,shift).applyMatrix4(inv);pa.setXYZ(i,p.x,p.y,p.z);}
    // Flatten both palm faces in depth, not just the thumb-side silhouette.
    const along=ref[9].clone().sub(origin),faceNormal=z.clone().addScaledVector(y,-along.dot(z)/along.dot(y)).normalize();
    const inverse=m.parent.matrixWorld.clone().invert(),halfThickness=.009;
    for(const sign of [-1,1]){
     const n=faceNormal.clone().multiplyScalar(sign),facePlane=new T.Plane().setFromNormalAndCoplanarPoint(n,origin.clone().addScaledVector(n,halfThickness)).applyMatrix4(inverse);
     const trimmed=cutClosedPalm(m.geometry,facePlane);m.geometry.dispose();m.geometry=trimmed;
    }
    const positions=m.geometry.attributes.position;let maximum=0;
    for(let i=0;i<positions.count;i++){const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(m.parent.matrixWorld);maximum=Math.max(maximum,Math.abs(p.sub(origin).dot(faceNormal)));}
    if(maximum>halfThickness+1e-6)throw Error('Palm surface exceeds flat thickness');
    m.geometry.userData.flatPalm={maximum,halfThickness};


   }
   m.geometry.computeBoundingBox();m.geometry.computeBoundingSphere();delete m.userData.directRestMatrix;
  }
 }
 const integrity=[...originals].every(([m,source])=>(m.geometry.userData.cut?.removed||(m.geometry.attributes.position.count===source.geometry.attributes.position.count&&m.geometry.index?.count===source.geometry.index?.count&&(!source.geometry.index||source.geometry.index.array.every((v,i)=>v===m.geometry.index.array[i]))))&&[...m.geometry.attributes.position.array,...m.geometry.attributes.normal.array].every(Number.isFinite));
 if(!integrity)throw Error('Original shell topology or normals changed');
 rig.root.updateMatrixWorld(true);rig.photoReference.originalShell=integrity;
}
