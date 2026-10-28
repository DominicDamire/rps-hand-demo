// Shared metric depth reference. Calibration changes gains, never bone lengths.
export function faceReference(face){const z=Math.abs(face?.matrix?.[14]||0)/100;return Number.isFinite(z)&&z>.01?z:null;}
export function calibratedDepth(raw,reference,metres,gain=1){if(!(raw>0&&reference>0&&metres>0))return null;return Math.max(.08,Math.min(4,metres+(raw/reference*metres-metres)*gain));}
export function eyeCenters(points){
 if(!points?.[33]||!points?.[133]||!points?.[263]||!points?.[362])return null;
 return [[33,133],[263,362]].map(([a,b])=>({x:(points[a].x+points[b].x)/2,y:(points[a].y+points[b].y)/2}));
}
export function eyeCenter(points){const eyes=eyeCenters(points);return eyes?{x:(eyes[0].x+eyes[1].x)/2,y:(eyes[0].y+eyes[1].y)/2}:null;}
