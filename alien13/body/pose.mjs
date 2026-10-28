const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const length=v=>Math.hypot(...v);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const ids={leftShoulder:11,rightShoulder:12,leftElbow:13,rightElbow:14,leftWrist:15,rightWrist:16,leftHip:23,rightHip:24};
const average=points=>points[0].map((_,i)=>points.reduce((sum,p)=>sum+p[i],0)/points.length);

// MediaPipe world landmarks are hip-relative, not a camera/world position.
// Anchor their relative shape to the tracked eyes. Never add hip coordinates
// directly to the first-person camera or rotate translation by the look gain.
export function upperBodyPose(image,world) {
  if(!image||!world) return null;
  // Pose Landmarker can still estimate a useful limb when its opposite side is
  // cropped. Accept landmarks slightly beyond the image boundary and let the
  // temporal retargeter decide which partial joints can safely update.
  const usable=i=>finite(world[i])&&finite(image[i])&&
    (image[i].visibility??0)>.28&&(image[i].presence??1)>.32&&
    image[i].x>=-.3&&image[i].x<=1.3&&image[i].y>=-.3&&image[i].y<=1.3;
  const headAnchors=[2,5,0,7,8].filter(usable),headAnchored=headAnchors.length>0;
  const anchors=headAnchored?headAnchors.slice(0,headAnchors.includes(2)&&headAnchors.includes(5)?2:1):[11,12].filter(usable);
  if(!anchors.length) return null;
  const eye=average(anchors.map(i=>[world[i].x,world[i].y,world[i].z]));
  const joints={};
  for(const [name,i] of Object.entries(ids)) {
    if(!usable(i)){joints[name]=null;continue;}
    const p=world[i];
    const relative=[eye[0]-p.x,eye[1]-p.y,p.z-eye[2]];
    joints[name]=length(relative)<1.6?relative:null;
  }
  const evidence=Object.entries(joints).filter(([name,p])=>p&&!name.includes('Hip')).map(([name])=>name);
  if(evidence.length<2||(!joints.leftShoulder&&!joints.rightShoulder)) return null;
  const width=joints.leftShoulder&&joints.rightShoulder?length(sub(joints.leftShoulder,joints.rightShoulder)):null;
  if(width!==null&&(width<.12||width>.9)) return null;
  const shoulder=joints.leftShoulder&&joints.rightShoulder?mid(joints.leftShoulder,joints.rightShoulder):
    [...(joints.leftShoulder||joints.rightShoulder)];
  let hipsTracked=!!(joints.leftHip&&joints.rightHip);
  let hip=hipsTracked?mid(joints.leftHip,joints.rightHip):null;
  if(hip&&(shoulder[1]-hip[1]<.12||shoulder[1]-hip[1]>.9)){
    joints.leftHip=joints.rightHip=null;hipsTracked=false;hip=null;
  }
  return {joints,width,shoulder,hip,hipsTracked,evidence,headAnchored,partial:!headAnchored||!width||evidence.length<6};
}

const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
export class BodyPose {
  constructor(mode='seated'){this.mode=mode;this.recenter();}
  recenter(mode=this.mode){
    this.mode=mode;this.samples=[];this.neutral=null;this.seen=-Infinity;
    this.target=null;this.joints={};this.filtered={};this.hipsTracked=false;this.signals=null;this.seatHips=null;this.partial=false;this.evidence=[];
  }
  receive(p,now){
    if(!p) return;
    // Keep seated proportions and seat anchor through desk/arm occlusion.
    if(now-this.seen>1500){this.target=null;this.joints={};this.filtered={};}
    if(now-this.seen>500&&!this.neutral)this.samples=[];
    this.seen=now;this.hipsTracked=p.hipsTracked;this.partial=p.partial;this.evidence=p.evidence;
    if(!this.neutral){
      // Standing crouch/torso calibration requires visible hips; seated does not.
      if(!p.width||(this.mode==='standing'&&!p.hipsTracked)) return;
      this.samples.push(p);
      if(this.samples.length<12) return;
      const reference=sub(p.joints.rightShoulder,p.joints.leftShoulder);
      this.neutral={width:median(this.samples.map(s=>s.width)),yaw:Math.atan2(reference[2],reference[0]),
        roll:Math.atan2(reference[1],Math.hypot(reference[0],reference[2])),
        lean:p.hip?sub(p.shoulder,p.hip):[0,.43,0],
        shoulder:[0,1,2].map(i=>median(this.samples.map(s=>s.shoulder[i]))),
        torso:median(this.samples.map(s=>s.hip?s.shoulder[1]-s.hip[1]:.43))};
    }
    // Keep proportions stable across frames instead of breathing with model scale.
    const scale=p.width?clamp(this.neutral.width/p.width,.8,1.25):1;
    const joints=Object.fromEntries(Object.entries(p.joints).map(([k,v])=>[k,v?.map(n=>n*scale)??null]));
    // With one shoulder cropped, keep the torso connected to the last skeleton
    // while still taking fresh elbow/wrist angles from the side that remains.
    // Missing arm joints become null immediately, so the rig eases that arm to
    // its relaxed pose instead of freezing it in space.
    if(this.target&&(!p.headAnchored||!joints.leftShoulder||!joints.rightShoulder)){
      const anchor=joints.leftShoulder&&joints.rightShoulder?'shoulders':joints.leftShoulder?'leftShoulder':joints.rightShoulder?'rightShoulder':null;
      if(anchor){
        const currentAnchor=anchor==='shoulders'?mid(joints.leftShoulder,joints.rightShoulder):joints[anchor];
        const oldAnchor=anchor==='shoulders'?mid(this.target.leftShoulder,this.target.rightShoulder):this.target[anchor];
        const delta=sub(oldAnchor,currentAnchor);
        for(const p of Object.values(joints))if(p)for(let i=0;i<3;i++)p[i]+=delta[i];
        if(anchor!=='shoulders'){
          const missing=anchor==='leftShoulder'?'rightShoulder':'leftShoulder';
          joints[missing]=this.target[missing]?[...this.target[missing]]:null;
        }
      }
    }
    if(this.mode==='seated'||!p.hipsTracked){
      // A neutral lower torso is explicitly inferred when seated behind a desk.
      // In standing mode hide the body until hips return (head stays live).
      if(this.mode==='standing'&&!this.target){this.target=null;return;}
      const center=mid(joints.leftShoulder,joints.rightShoulder);
      const across=sub(joints.leftShoulder,joints.rightShoulder);
      for(const [key,sign] of [['leftHip',1],['rightHip',-1]])
        joints[key]=center.map((v,i)=>v+sign*across[i]*.36-(i===1?this.neutral.torso:0));
    }
    this.target=joints;
    const across=sub(joints.rightShoulder,joints.leftShoulder);
    const shoulders=mid(joints.leftShoulder,joints.rightShoulder), hips=mid(joints.leftHip,joints.rightHip);
    const angle=Math.atan2(across[2],across[0])-this.neutral.yaw;
    this.signals={yaw:Math.atan2(Math.sin(angle),Math.cos(angle)),
      roll:Math.atan2(across[1],Math.hypot(across[0],across[2]))-this.neutral.roll,
      leanX:shoulders[0]-hips[0]-this.neutral.lean[0],leanZ:shoulders[2]-hips[2]-this.neutral.lean[2],hipsTracked:p.hipsTracked};
  }
  update(now,dt,enabled=true,eyePosition=[0,0,0]){
    // Do not pin a stale arm pose. A short grace period only covers alternating
    // face/body inference; after that the rig relaxes while the head stays live.
    if(!enabled||!this.target||now-this.seen>220){this.joints={};this.filtered={};this.signals=null;return null;}
    const a=1-Math.exp(-Math.min(dt,.1)/.035);
    for(const [key,p] of Object.entries(this.target)){
      if(!p){this.filtered[key]=null;continue;}
      const old=this.filtered[key];
      this.filtered[key]=old?p.map((v,i)=>old[i]+(v-old[i])*a):[...p];
    }
    this.joints=Object.fromEntries(Object.entries(this.filtered).map(([key,p])=>[key,p?[...p]:null]));
    if(this.mode==='seated'){
      // Large head motion carries the shoulders/arms instead of lengthening the neck.
      const neck=[0,-.11,.045],shoulder=mid(this.joints.leftShoulder,this.joints.rightShoulder);
      const rest=clamp(length(sub(this.neutral.shoulder,neck)),.055,.12),maxNeck=rest*1.15;
      const offset=sub(shoulder,neck),distance=length(offset);
      if(distance>maxNeck){
        const correction=offset.map(v=>v*(maxNeck/distance-1));
        for(const p of Object.values(this.joints))if(p)for(let i=0;i<3;i++)p[i]+=correction[i];
      }
      this.seatHips??=Object.fromEntries(['leftHip','rightHip'].map(key=>[key,this.joints[key].map((v,i)=>v+eyePosition[i])]));
      const desired=mid(this.joints.leftHip,this.joints.rightHip).map((v,i)=>v+eyePosition[i]);
      const base=mid(this.seatHips.leftHip,this.seatHips.rightHip),travel=sub(desired,base);
      // Keep only 6cm of seated lean. All excess becomes whole-body travel.
      const carry=Math.max(0,1-.06/Math.max(1e-9,length(travel)));
      for(const key of ['leftHip','rightHip'])this.joints[key]=this.seatHips[key].map((v,i)=>v+travel[i]*carry-eyePosition[i]);
    }
    return this.joints;
  }
}
