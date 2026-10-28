import * as T from 'three';
export const fingers=['Thumb','Index','Middle','Ring','Pinky'];
const V=()=>new T.Vector3();
function basis(o,a,b){const x=a.clone().sub(o).normalize(),z=V().crossVectors(x,b.clone().sub(o)).normalize();return new T.Matrix4().makeBasis(x,V().crossVectors(z,x).normalize(),z);}
export function poseHand(rig,S,points){
 const rest=rig.rest,hand=S+'Hand',m=basis(points[0],points[5],points[17]).multiply(basis(rest[hand].world,rest[S+'Index1'].world,rest[S+'Pinky1'].world).invert());rig.setWorldQuat(hand,new T.Quaternion().setFromRotationMatrix(m));
 for(let f=0;f<5;f++)for(let k=1;k<=3;k++){
  const name=S+fingers[f]+k,j=rig.joints[name],here=rest[name].world,next=rest[S+fingers[f]+(k+1)]?.world,prev=rest[S+fingers[f]+(k-1)]?.world;
  const axis=next?next.clone().sub(here):rig.tips[S+fingers[f]].clone(),dir=points[4*f+k+1].clone().sub(points[4*f+k]);
  rig.refresh(j);dir.applyQuaternion(j.parent.getWorldQuaternion(new T.Quaternion()).invert());if(dir.lengthSq()>1e-10)j.quaternion.setFromUnitVectors(axis.normalize(),dir.normalize());rig.refresh(j);
 }
 rig.root.updateMatrixWorld(true);
}
// Mesh dimensions, joint translations and scale are never touched by either solver.
export function fingerTip(rig,S,f){const name=S+f+'3',j=rig.joints[name];return j.localToWorld(rig.tips[S+f].clone());}
export function fitFinger(rig,S,f,target){
 const chain=[1,2,3].map(k=>rig.joints[S+f+k]),initial=chain.map(j=>j.quaternion.clone());
 for(let it=0;it<5;it++)for(let k=2;k>=0;k--){const j=chain[k],o=j.getWorldPosition(V()),a=fingerTip(rig,S,f).sub(o),b=target.clone().sub(o);if(a.lengthSq()<1e-10||b.lengthSq()<1e-10)continue;
  const delta=new T.Quaternion().setFromUnitVectors(a.normalize(),b.normalize()),world=j.getWorldQuaternion(new T.Quaternion()).premultiply(delta),local=j.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world),angle=initial[k].angleTo(local);
  // Assistance has a bounded deviation from the observed pose, not an arbitrary fist preset.
  if(angle>.65)local.slerp(initial[k],1-.65/angle);j.quaternion.copy(local);j.updateWorldMatrix(false,true);
 }
 return fingerTip(rig,S,f).distanceTo(target);
}
export class GripState{
 constructor(){this.clear();}
 clear(){this.object=null;this.since=0;this.held=false;this.anchor=null;this.last=null;this.relative=null;this.contact=null;this.contactOffset=null;}
 anchorWorld(){return this.contact?.sample?this.contact.sample().add(this.contactOffset):this.object.localToWorld(this.anchor.clone());}
 update({object,point,contact=null,closing,now,enabled,dwell=350,range=.04,movable=false}){
  const speed=this.last?point.distanceTo(this.last.point)/Math.max(.001,(now-this.last.time)/1000):Infinity;this.last={point:point.clone(),time:now};
  if(!enabled||!object||!closing){this.object=null;this.held=false;this.since=0;this.anchor=null;this.relative=null;return false;}
  if(this.object!==object){this.object=object;this.since=now;this.held=false;this.relative=null;this.anchor=object.worldToLocal(point.clone());this.contact=contact;this.contactOffset=contact?point.clone().sub(contact.point):null;}
  const anchor=this.anchorWorld();if(!(movable&&this.held)&&point.distanceTo(anchor)>Math.max(.07,range*2)){this.clear();return false;}
  if(!this.held){if(speed>.12)this.since=now;this.held=now-this.since>=dwell;}return this.held;
 }
}
// Closest point on actual triangles in a rigid mesh's local frame. Cached local geometry;
// camera rotation never participates in contact calculations.
export class Surface{
 constructor(meshes,object){this.meshes=meshes;this.object=object;this.records=meshes.map(mesh=>{const g=mesh.geometry,p=g.attributes.position,index=g.index,ts=[];for(let i=0;i<(index?.count||p.count);i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);ts.push(new T.Triangle(...ids.map(id=>V().fromBufferAttribute(p,id))));}return {mesh,ts,ids:Array.from({length:index?.count||p.count},(_,i)=>index?index.getX(i):i)};});}
 refresh(){for(const r of this.records){if(!r.mesh.isSkinnedMesh)continue;r.mesh.skeleton.update();for(let i=0;i<r.ts.length;i++){const t=r.ts[i];for(const [k,v] of [[0,t.a],[1,t.b],[2,t.c]])r.mesh.getVertexPosition(r.ids[i*3+k],v);}}}
 closest(world){let best=null;for(const {mesh,ts} of this.records){mesh.updateWorldMatrix(true,false);const local=mesh.worldToLocal(world.clone()),q=V();let candidate=null,d2=Infinity;for(const tri of ts){tri.closestPointToPoint(local,q);const d=q.distanceToSquared(local);if(d<d2){d2=d;candidate={point:q.clone(),normal:tri.getNormal(V()),tri,weights:tri.getBarycoord(q,V())};}}if(candidate){const point=mesh.localToWorld(candidate.point),distance=point.distanceTo(world);if(!best||distance<best.distance)best={point,normal:candidate.normal.transformDirection(mesh.matrixWorld),distance,object:this.object,sample:()=>mesh.localToWorld(candidate.tri.a.clone().multiplyScalar(candidate.weights.x).addScaledVector(candidate.tri.b,candidate.weights.y).addScaledVector(candidate.tri.c,candidate.weights.z))};}}return best;}
}

export function fitPalmDistance(lm,offsets,aspect,fov=60){const h=2*Math.tan(fov*Math.PI/360),u=p=>(.5-p.x)*h*aspect,v=p=>(.5-p.y)*h,u0=u(lm[0]),v0=v(lm[0]);let num=0,den=0;for(const [i,o] of offsets){const a=u(lm[i])-u0,b=v(lm[i])-v0;num+=a*(o.x-u(lm[i])*o.z)+b*(o.y-v(lm[i])*o.z);den+=a*a+b*b;}const distance=num/den;return den>.00005&&distance>.12&&distance<3?distance:null;}

export function poseHead(rig,{pitch=0,yaw=0,roll=0}) {
 for(const [name,share] of [['Neck',.45],['Head',1]]) {
  const q=new T.Quaternion().setFromEuler(new T.Euler(pitch*share,yaw*share,roll*share,'YXZ'));
  rig.setWorldQuat(name,q);rig.joints[name].updateWorldMatrix(false,true);
 }
}

export function pinTrackedEyes(rig,target){
 rig.root.updateMatrixWorld(true);const current=rig.joints.Head.localToWorld(rig.eyeInHead.clone());rig.root.position.add(target.clone().sub(current));rig.root.updateMatrixWorld(true);
}

// A nearby point alone is not a grasp: require separate digits on different sides.
export function hasGripSupport(contacts,range){
 const limit=Math.min(range,.015),near=contacts.filter(c=>c.distance<limit);
 return near.some((a,i)=>near.slice(i+1).some(b=>a.finger!==b.finger&&a.normal.dot(b.normal)<.5));
}
