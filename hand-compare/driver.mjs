import {directDriver as archived} from './archived-direct.mjs?v=camera3';
import {directDriver as current} from './angle-direct.mjs';
export const variant=['archive','reference','direct','rays','angles'].includes(new URLSearchParams(location.search).get('variant'))?new URLSearchParams(location.search).get('variant'):'direct';
export function directDriver(rig,tips){const drive=(variant==='archive'||variant==='reference'?archived:current)(rig,tips);return (p,s,q,dt,o)=>drive(p,s,q,dt,{...o,fitImage:variant==='rays'&&document.getElementById('fitEnabled')?.checked!==false,fitAngles:variant==='angles'&&document.getElementById('fitEnabled')?.checked!==false});}
