import {findTouchPair,solveTouchDepth} from './hand-pair-depth.mjs?v=pnpsimple2';
// Temporary per-frame correction: never write to the captured sweep mapping.
export class HandContactAssist {
 constructor(){this.reset();}
 reset(){this.key=null;this.since=0;this.lastTime=null;this.observations=0;this.status='Contact matching off.';}
 update({left,right,aspect=1,now,enabled,rangePercent=18,confirmMs=100,maxSideChange=.035,indexOnly=false,tipsOnly=false,tipGap=.001,assumeIndexContact=false}){
  if(!enabled){this.reset();return null;}
  if(!left||!right||now-left.seen>=250||now-right.seen>=250||left.time!==right.time||left.confidence<.5||right.confidence<.5){this.reset();this.status='Contact needs both hands detected in the same fresh camera frame.';return null;}
  const pair=findTouchPair(left,right,aspect,this.key,{rangePercent,indexOnly,tipsOnly,tipGap:Math.max(0,Math.min(.01,tipGap)),assumeIndexContact});
  if(!pair){this.reset();this.status='No touching finger lines detected.';return null;}
  if(this.key!==pair.key){this.since=now;this.observations=0;this.lastTime=null;}this.key=pair.key;
  if(left.time!==this.lastTime){this.lastTime=left.time;this.observations++;}
  if(now-this.since<confirmMs||this.observations<(confirmMs>0?2:1)){this.status='Confirming touching finger lines…';return null;}
  const fit=solveTouchDepth(pair.a,pair.b,left.points[0],right.points[0],{surfaceGap:pair.surfaceGap,maxSideChange:Math.max(0,maxSideChange)});
  this.status=fit?'Contact correction applied.':'Touching lines found, but depth fit rejected the required movement.';
  return fit?{...fit,key:pair.key,pair}:null;
 }
}
