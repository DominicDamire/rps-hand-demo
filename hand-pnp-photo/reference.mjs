import * as T from 'three';
import {DollRig} from '../doll/DollRig.js';
import {fitPhotoHand,PHOTO_POINTS} from './photo-hand.mjs?v=flat11';
import {directDriver} from './direct.mjs?v=aligned2';
import {loadCV} from './opencv-core.mjs';
import {solvePalmPose} from './palm-pnp.mjs?v=palm4';
const $=id=>document.getElementById(id),crop={x:180,y:490,w:290,h:370},fingers=['Thumb','Index','Middle','Ring','Pinky'];
const scene=new T.Scene(),rig=new DollRig(scene,{headLayer:false}),camera=new T.PerspectiveCamera(60,crop.w/crop.h,.001,10);
const renderer=new T.WebGLRenderer({canvas:$('model'),alpha:true,antialias:true});renderer.setSize(580,740,false);
scene.add(new T.HemisphereLight(0xffffff,0x526980,3));const lamp=new T.DirectionalLight(0xffffff,3);lamp.position.set(1,2,3);scene.add(lamp);
const cv=await loadCV();await rig.ready;const report=fitPhotoHand(rig,{preservePalmRelief:true}),tips={};
for(const s of ['R','L'])for(const [f,n]of fingers.entries())tips[s+n]=rig.photoReference.targets[s][4+4*f].clone().sub(rig.photoReference.targets[s][3+4*f]);
const drive=directDriver(rig,tips);for(const m of rig.parts){m.visible=/^R(Hand|Thumb|Index|Middle|Ring|Pinky)/.test(m.name);m.material=m.material.clone();m.material.transparent=true;m.material.opacity=.65;}
const edges=[];for(let f=0;f<5;f++){edges.push([0,1+4*f]);for(let k=0;k<3;k++)edges.push([1+4*f+k,2+4*f+k]);}
const lines=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xffa53d,depthTest:false,depthWrite:false,transparent:true}));lines.renderOrder=99;scene.add(lines);
const dots=new T.Points(new T.BufferGeometry(),new T.PointsMaterial({color:0xffa53d,size:6,sizeAttenuation:false,depthTest:false,depthWrite:false,transparent:true}));dots.renderOrder=100;scene.add(dots);
let generation=0;
async function show(){
 const token=++generation,source=PHOTO_POINTS,img=new Image();img.src='reference-open.jpg';await img.decode();if(token!==generation)return;
 const ctx=$('photo').getContext('2d');ctx.drawImage(img,crop.x,crop.y,crop.w,crop.h,0,0,580,740);
 const lm=source.map(([x,y])=>({x:(x-crop.x)/crop.w,y:(y-crop.y)/crop.h}));
 const model=[0,5,9,13,17].map(i=>rig.photoReference.targets.R[i].clone().sub(rig.photoReference.targets.R[0]).toArray());
 const focal=1/(2*Math.tan(Math.PI/6)),fit=solvePalmPose(cv,model,lm,crop.w/crop.h,focal);
 if(!fit)throw Error('Reference palm pose could not be solved');
 const r=fit.matrix,q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().set(r[0],r[1],r[2],0,-r[3],-r[4],-r[5],0,-r[6],-r[7],-r[8],0,0,0,0,1));
 const points=lm.map(p=>new T.Vector3((p.x-.5)*crop.w/crop.h/focal*fit.translation[2],(.5-p.y)/focal*fit.translation[2],-fit.translation[2]));
 points[0].set(fit.translation[0],-fit.translation[1],-fit.translation[2]);
 const result=drive(points,'R',q,1/60,{lm,width:crop.w,height:crop.h,thickness:1,tipInset:0,fitImage:true});
 rig.root.updateMatrixWorld(true);
 const actual=[rig.joints.RHand.getWorldPosition(new T.Vector3())];
 for(const f of fingers){for(let k=1;k<=3;k++)actual.push(rig.joints['R'+f+k].getWorldPosition(new T.Vector3()));actual.push(rig.joints['R'+f+'3'].localToWorld(tips['R'+f].clone()));}
 lines.geometry.dispose();lines.geometry=new T.BufferGeometry().setFromPoints(edges.flatMap(([a,b])=>[actual[a],actual[b]]));dots.geometry.dispose();dots.geometry=new T.BufferGeometry().setFromPoints(actual);
 const errors=actual.map((p,i)=>{const v=p.clone().project(camera);return Math.hypot((v.x+1)*crop.w/2+crop.x-source[i][0],(1-v.y)*crop.h/2+crop.y-source[i][1]);});
 const rigError=Math.max(...actual.map((p,i)=>p.distanceTo(result.points[i])));
 $('status').textContent='Image 1 · actual joint projection: RMS '+Math.sqrt(errors.reduce((a,e)=>a+e*e,0)/21).toFixed(3)+' px; maximum '+Math.max(...errors).toFixed(3)+' px.\nJoint/driver agreement: '+(rigError*1000).toFixed(6)+' model mm. Palm pivot moved '+report.R.wristAnchorShiftMm.toFixed(1)+' model mm from the wrist ball.\n'+'Dimensions follow Image 1 only. Pixel matching does not measure physical millimetres.';
 renderer.render(scene,camera);
}
$('open').onclick=()=>show().catch(fail);
$('opacity').oninput=()=>{for(const m of rig.parts)m.material.opacity=+$('opacity').value;renderer.render(scene,camera);};
function fail(e){$('status').textContent='Alignment check failed: '+e.message;console.error(e);}
show().catch(fail);
