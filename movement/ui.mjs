export function setupUI(){
 const $=id=>document.getElementById(id),panel=$('panel'),preview=$('preview');
 const keepInside=el=>{const r=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(r.left,innerWidth-r.width-8))+'px';el.style.top=Math.max(8,Math.min(r.top,innerHeight-r.height-8))+'px';el.style.right='auto';el.style.bottom='auto';};
 function draggable(el,handle){let drag;
  handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=el.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};handle.setPointerCapture(e.pointerId);e.preventDefault();});
  handle.addEventListener('pointermove',e=>{if(!drag)return;el.style.left=drag.left+e.clientX-drag.x+'px';el.style.top=drag.top+e.clientY-drag.y+'px';el.style.right='auto';el.style.bottom='auto';keepInside(el);});
  const done=()=>{drag=null;};handle.addEventListener('pointerup',done);handle.addEventListener('pointercancel',done);handle.addEventListener('lostpointercapture',done);
  handle.addEventListener('keydown',e=>{const d={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(!d)return;e.preventDefault();const r=el.getBoundingClientRect();el.style.left=r.left+d[0]+'px';el.style.top=r.top+d[1]+'px';keepInside(el);});
 }
 draggable(panel,$('panelHandle'));draggable(preview,$('previewHandle'));
 $('collapse').onclick=()=>{const collapsed=panel.classList.toggle('collapsed');$('collapse').textContent=collapsed?'Show controls':'Hide controls';$('collapse').setAttribute('aria-expanded',String(!collapsed));requestAnimationFrame(()=>keepInside(panel));};
 $('hidePreview').onclick=()=>{preview.hidden=true;$('showPreview').hidden=false;};
 $('showPreview').onclick=()=>{preview.hidden=false;$('showPreview').hidden=true;keepInside(preview);};
 $('resetLayout').onclick=()=>{panel.removeAttribute('style');preview.removeAttribute('style');panel.classList.remove('collapsed');$('collapse').textContent='Hide controls';$('collapse').setAttribute('aria-expanded','true');preview.hidden=false;$('showPreview').hidden=true;};
 addEventListener('resize',()=>{if(panel.style.left)keepInside(panel);if(preview.style.left&&!preview.hidden)keepInside(preview);});
 const canvas=$('tracking'),ctx=canvas.getContext('2d');let trail=[];
 const zoomView=(hands,w,h,joystick)=>{
  const crop=handViewport(w,h,hands?.[0],joystick),box=$('previewImage');
  box.style.aspectRatio='4/3';$('cam').style.visibility=hands?.length||joystick?.centre?'visible':'hidden';const zoom=box.clientWidth/crop.width;
  for(const el of [$('cam'),$('camImg'),canvas]){if(!el)continue;el.style.width=w*zoom+'px';el.style.height=h*zoom+'px';el.style.left=-crop.x*zoom+'px';el.style.top=-crop.y*zoom+'px';}
  const speed=Math.hypot(joystick?.x||0,joystick?.z||0);
  const _r=crop;$('handZoomState').textContent=!joystick?.centre?(joystick?.reason==='OPEN PALM · RESET'?'Open palm · reset':'Show selected finger'):joystick.active?(speed>1.01?'BOOST ':'MOVE ')+Math.round(speed*100)+'%':joystick.reason==='RETURN FINGER TO CENTRE'?'Finger to green centre':joystick.reason?.includes('TRACKING')||!hands?.length?'Show hand to resume':'Centre / fist = stop';
  return _r;
 };

 const edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
 // --- the two extra boxes: what the face tracker sees, and what the hand tracker sees -------------------------
 let lastHandsPaint=-Infinity;
 const faceC=$('faceCanvas'),handsC=$('handsCanvas');
 const fctx=faceC?.getContext('2d'),hctx=handsC?.getContext('2d');
 const fit=(c,w,h)=>{const W=c.clientWidth*devicePixelRatio|0,H=c.clientHeight*devicePixelRatio|0;if(c.width!==W||c.height!==H){c.width=W;c.height=H;}return [c.width,c.height];};
 return {clear(){trail=[];ctx.clearRect(0,0,canvas.width,canvas.height);if(fctx)fctx.clearRect(0,0,faceC.width,faceC.height);if(hctx)hctx.clearRect(0,0,handsC.width,handsC.height);},
  // The face tracker gives a pose, not a mesh: where the face is in the picture, how big it is, and which way it is
  // pointing. Drawn as the oval it found, the eye line, and an arrow along the gaze - enough to see it working.
  face(pose,found){
   if(!fctx)return;const [W,H]=fit(faceC);fctx.clearRect(0,0,W,H);
   const note=$('faceNote');
   if(!pose||!found){if(note)note.textContent='no face';return;}
   const x=(1-pose.centerX)*W,y=pose.centerY*H,r=Math.max(6,pose.span*W*1.6);
   fctx.lineWidth=Math.max(1.5,W/220);
   fctx.strokeStyle='#67ffbb';fctx.beginPath();fctx.ellipse(x,y,r*0.78,r,0,0,Math.PI*2);fctx.stroke();
   fctx.strokeStyle='#67ffbb88';fctx.beginPath();fctx.moveTo(x-r*0.78,y);fctx.lineTo(x+r*0.78,y);fctx.stroke();
   fctx.beginPath();fctx.moveTo(x,y-r);fctx.lineTo(x,y+r);fctx.stroke();
   const e=r*0.34;fctx.fillStyle='#e5fff3';
   for(const s of [-1,1]){fctx.beginPath();fctx.arc(x+s*e,y-r*0.18,Math.max(2,W/150),0,Math.PI*2);fctx.fill();}
   const g=r*1.5;fctx.strokeStyle='#ffdf75';fctx.lineWidth=Math.max(2,W/170);
   fctx.beginPath();fctx.moveTo(x,y);fctx.lineTo(x-Math.sin(pose.yaw)*g,y-Math.sin(pose.pitch)*g);fctx.stroke();
   if(note)note.textContent=`yaw ${(pose.yaw*180/Math.PI).toFixed(0)}° · pitch ${(pose.pitch*180/Math.PI).toFixed(0)}°`;
  },
  // Every hand the tracker found, with its finger lines, and which is which.
  hands(list,labels){
   const now=performance.now();if(now-lastHandsPaint<66)return;lastHandsPaint=now;
   if(!hctx)return;const [W,H]=fit(handsC);hctx.clearRect(0,0,W,H);
   const note=$('handsNote');
   const hands=(list||[]).filter(h=>h&&h.length===21);
   if(!hands.length){if(note)note.textContent='no hands';return;}
   const pt=p=>[(1-p.x)*W,p.y*H];
   hands.forEach((hand,i)=>{
    const colour=i===0?'#67ffbb':'#7cc5ff';
    hctx.lineWidth=Math.max(1.5,W/200);hctx.lineCap='round';hctx.strokeStyle=colour;
    for(const [a,b] of edges){hctx.beginPath();hctx.moveTo(...pt(hand[a]));hctx.lineTo(...pt(hand[b]));hctx.stroke();}
    hctx.fillStyle='#e5fff3';
    for(let k=0;k<21;k++){hctx.beginPath();hctx.arc(...pt(hand[k]),k%4===0?W/95:W/150,0,Math.PI*2);hctx.fill();}
    hctx.fillStyle=colour;hctx.font='bold '+Math.max(10,Math.round(W/24))+'px system-ui,sans-serif';
    const [lx,ly]=pt(hand[0]);hctx.textAlign='center';
    hctx.fillText(labels?.[i]||'',lx,Math.min(H-4,ly+W/16));
   });
   if(note)note.textContent=hands.length===1?'1 hand':hands.length+' hands';
  },camera(on){$('previewNote').hidden=on;this.clear();},draw(hands,w,h,active=false,joystick=null,roles=null){   // roles: {joy, model, head} - which hand does what, drawn on the preview
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;$('previewImage').style.aspectRatio=w+'/'+h;}
  ctx.clearRect(0,0,w,h);if(preview.hidden)return;const crop=zoomView(hands,w,h,joystick);
  const tip=joystick?.tip??4;const point=p=>[(1-p.x)*w,p.y*h];
  const now=performance.now();trail=trail.filter(p=>now-p.t<350);if(active&&hands?.length===1)trail.push({xy:point(hands[0][tip]),t:now});else trail=[];
  for(const hand of hands??[]){if(hand.length!==21)continue;
   ctx.lineWidth=Math.max(2,w/240);ctx.lineCap='round';
   for(const [a,b]of edges){ctx.strokeStyle=(tip===8?a>=5&&b<=8:a>=1&&b<=4)?'#ffdf75':'#67ffbb';ctx.beginPath();ctx.moveTo(...point(hand[a]));ctx.lineTo(...point(hand[b]));ctx.stroke();}
   for(let i=0;i<21;i++){ctx.fillStyle=i===tip?'#ffdf75':'#e5fff3';ctx.beginPath();ctx.arc(...point(hand[i]),i===tip?w/65:w/160,0,Math.PI*2);ctx.fill();}
   const [x,y]=point(hand[tip]);ctx.strokeStyle=active?'#ffdf75':'#ffffff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,w/38,0,Math.PI*2);ctx.stroke();
  }
  if(roles&&roles.labels){   // ?labels=1: name each hand. Off by default - only the joystick is shown in the panel
   const shown=hands??[];
   if(roles.model&&roles.model.length===21&&!shown.includes(roles.model)){
    ctx.lineWidth=Math.max(1.5,w/420);ctx.strokeStyle='#5aa9ffcc';
    for(const [a,b] of edges){ctx.beginPath();ctx.moveTo(...point(roles.model[a]));ctx.lineTo(...point(roles.model[b]));ctx.stroke();}
    for(let i=0;i<21;i++){ctx.fillStyle='#5aa9ff';ctx.beginPath();ctx.arc(...point(roles.model[i]),w/260,0,Math.PI*2);ctx.fill();}
   }
   // The preview is zoomed into a crop of the camera, so every label is clamped inside that crop or it would be cut off.
   const size=Math.max(11,Math.round(crop.width/16)),pad=size*0.7;
   const clampX=(x,half)=>Math.min(crop.x+crop.width-half-pad,Math.max(crop.x+half+pad,x));
   const clampY=y=>Math.min(crop.y+crop.height-pad,Math.max(crop.y+size+pad,y));
   const tag=(pts,text,colour)=>{if(!pts||pts.length!==21)return;const [x0,y0]=point(pts[0]);
    ctx.font='bold '+size+'px system-ui,sans-serif';ctx.textAlign='center';
    const x=clampX(x0,ctx.measureText(text).width/2),y=clampY(y0+size*1.6);
    ctx.lineWidth=Math.max(3,size/3);ctx.strokeStyle='rgba(8,12,18,.9)';ctx.strokeText(text,x,y);ctx.fillStyle=colour;ctx.fillText(text,x,y);};
   tag(roles.joy,'JOYSTICK','#ffdf75');tag(roles.model,'3D HAND','#7cc5ff');
   const ht=roles.head?'HEAD TRACKED':'HEAD NOT SEEN';
   ctx.font='bold '+Math.round(size*0.8)+'px system-ui,sans-serif';ctx.textAlign='left';
   ctx.lineWidth=Math.max(3,size/3);ctx.strokeStyle='rgba(8,12,18,.9)';
   ctx.strokeText(ht,crop.x+pad,crop.y+size+pad);ctx.fillStyle=roles.head?'#67ffbb':'#94a3b8';ctx.fillText(ht,crop.x+pad,crop.y+size+pad);
  }
  if(joystick)drawThumbJoystick(ctx,hands?.[0],w,h,joystick);
  if(trail.length>1){ctx.strokeStyle='#ffab45';ctx.lineWidth=Math.max(3,w/140);ctx.beginPath();trail.forEach((p,i)=>i?ctx.lineTo(...p.xy):ctx.moveTo(...p.xy));ctx.stroke();}
 }};
}

// Captured screen anchor and scale stay fixed while the live thumb moves.
export function drawThumbJoystick(ctx,hand,w,h,joystick){
 const {centre,scale,active,reason}=joystick;const tip=joystick.tip??4;
 const vx=joystick.x||0,vz=joystick.z||0,speed=Math.min(1.6,Math.hypot(vx,vz));

 ctx.save();ctx.font=`bold ${Math.max(12,w/42)}px sans-serif`;
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 const label=(text,x,y)=>{ctx.lineWidth=5;ctx.strokeStyle='#07131fee';ctx.strokeText(text,x,y);ctx.fillStyle='#ffffff';ctx.fillText(text,x,y);};
 if(!centre||!Number.isFinite(scale)){
  label('SHOW FINGER',w/2,h-24);ctx.restore();return;
 }
 const unit=scale*w,cx=centre[0]*w,cy=centre[1]*w;
 const r=.5*unit,dead=(active?.14:.20)*unit;
 const tx=hand?.[tip]?(1-hand[tip].x)*w:cx,ty=hand?.[tip]?hand[tip].y*h:cy;
 ctx.lineWidth=Math.max(2,w/300);
 ctx.fillStyle='#06172744';ctx.strokeStyle='#ffffffdd';
 ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.stroke();
 if(active&&speed>0){
  const angle=Math.atan2(vz,vx);
  ctx.fillStyle='#ffdb6833';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle-.30,angle+.30);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#ffdb68';ctx.lineWidth=5;ctx.beginPath();ctx.arc(cx,cy,r,angle-.30,angle+.30);ctx.stroke();
 }
 ctx.strokeStyle='#ffa14a99';ctx.setLineDash([3,5]);ctx.beginPath();ctx.arc(cx,cy,.8*unit,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#6dffb344';ctx.strokeStyle='#6dffb3';
 ctx.beginPath();ctx.arc(cx,cy,dead,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.setLineDash([4,5]);ctx.strokeStyle='#ffffff77';ctx.beginPath();
 ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle=active?'#ffdb68':'#6dffb3';ctx.lineWidth=3;
 ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(tx,ty);ctx.stroke();
 ctx.fillStyle='#ffdb68';ctx.beginPath();ctx.arc(tx,ty,Math.max(7,w/75),0,Math.PI*2);ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#101b25';ctx.stroke();
 const font=Math.max(7,unit*.14);ctx.font=`bold ${font}px sans-serif`;
 label('↑',cx,cy-.66*unit);label('↓',cx,cy+.66*unit);
 label('←',cx-.66*unit,cy);label('→',cx+.66*unit,cy);
 const direction=[vz<-.05?'FORWARD':vz>.05?'BACK':'',vx<-.05?'LEFT':vx>.05?'RIGHT':''].filter(Boolean).join(' ');
 const waiting=!hand||reason==='RETURN FINGER TO CENTRE'||reason==='TRACKING LOST';
 label(active?`${speed>1.01?'BOOST · ':''}${direction} ${Math.round(speed*100)}%`:waiting?'RETURN FINGER TO CENTRE':reason?.includes('FIST')?'FIST REST':'CENTRE = STOP',w/2,20);
 const barWidth=w*.24,bx=(w-barWidth)/2;
 ctx.fillStyle='#08151dcc';ctx.fillRect(bx,36,barWidth,7);
 ctx.fillStyle=active?'#ffdb68':'#6dffb3';ctx.fillRect(bx,36,barWidth*Math.min(1,speed/1.6),7);
 ctx.restore();
}

// Crop in the same mirrored pixel coordinates as the overlay. Once centred,
// the crop depends only on the saved anchor/scale, never the moving hand.
export function handViewport(w,h,hand,joystick){
 if(!w||!h)return {x:0,y:0,width:1,height:.75};
 let cx,cy,width;
 if(joystick?.centre&&joystick?.viewScale>0){
  const unit=(joystick.scale||joystick.viewScale*.55)*w;cx=joystick.centre[0]*w;cy=joystick.centre[1]*w;width=unit*2.65;
 }else if(hand?.length===21){
  const thumb=joystick?.tip===8?hand.slice(5,9):hand.slice(2,5);const xs=thumb.map(p=>(1-p.x)*w),ys=thumb.map(p=>p.y*h);
  cx=(Math.min(...xs)+Math.max(...xs))/2;cy=(Math.min(...ys)+Math.max(...ys))/2;
  width=Math.max(Math.max(...xs)-Math.min(...xs),(Math.max(...ys)-Math.min(...ys))*4/3)*1.35;
 }else{return {x:0,y:0,width:w,height:h};}
 width=Math.min(Math.max(w*.12,width),w,h*4/3);const height=width*.75;
 return {x:Math.max(0,Math.min(w-width,cx-width/2)),y:Math.max(0,Math.min(h-height,cy-height/2)),width,height};
}
