// The existing closed-fist reference bends the four MCP joints by 80 degrees.
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=a=>{const n=Math.hypot(...a);return n>1e-8?a.map(v=>v/n):null;};
export function limitBaseSplay(direction,restForward,restAcross,fullBendDegrees=80){
 const v=unit(direction),forward=unit(restForward);if(!v||!forward)return direction.slice();
 const across=unit(restAcross.map((v,i)=>v-dot(restAcross,forward)*forward[i]));if(!across)return direction.slice();
 const normal=[across[1]*forward[2]-across[2]*forward[1],across[2]*forward[0]-across[0]*forward[2],across[0]*forward[1]-across[1]*forward[0]];
 const f=dot(v,forward),n=dot(v,normal),side=dot(v,across),radial=Math.hypot(f,n);if(radial<1e-8)return direction.slice();
 const bend=Math.abs(Math.atan2(n,f))*180/Math.PI,ratio=bend/fullBendDegrees;
 if(ratio<=.65)return direction.slice();
 const t=Math.min(1,(ratio-.65)/.05),weight=t*t*(3-2*t),splay=Math.atan2(side,radial)*(1-weight);
 return forward.map((value,i)=>(value*f+normal[i]*n)/radial*Math.cos(splay)+across[i]*Math.sin(splay));
}
