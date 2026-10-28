export function installExperiments(){
 const box=document.createElement('details');box.open=true;box.className='settingTab';
 const flags={handDepth:true,headFilter:true,shoulderMotion:true,metricDepth:false,palmFit:true,worldDepth:true,jitterCalc:true,jointFilters:true,headDepth:true,faceMapping:true};
 const names={handDepth:'Estimate hand distance (OFF fixes wrist depth at phone-distance setting)',headFilter:'Head smoothing (uses Head smoothing slider)',shoulderMotion:'Apply shoulder rotation',rawOnly:'Raw landmarks only — skip all 3D model calculations',metricDepth:'MediaPipe metric palm distance (OFF uses legacy size/depth estimate)',palmFit:'Refine depth against model palm (two passes)',worldDepth:'Use MediaPipe relative Z for finger depth',jitterCalc:'Landmark jitter filter',jointFilters:'Finger smoothing and joint limits',headDepth:'Estimate head distance from face size',faceMapping:'Calculate face dots on model surface'};
 box.innerHTML='<summary>Depth and movement settings</summary><p>Camera-size depth estimation, fixed model proportions, hand stabilization and joint limits are enabled by default. Contact and collision assistance remain off.</p>';
 for(const [id,value] of Object.entries(flags)){const label=document.createElement('label');label.innerHTML=`<input type="checkbox" id="exp_${id}" ${value?'checked':''}> ${names[id]}`;box.append(label);}
 const status=document.createElement('p');status.id='calculationTiming';status.textContent='Waiting for timing samples';box.append(status);
 document.getElementById('directSettings').prepend(box);
 return ()=>({rawOnly:false,...Object.fromEntries(Object.keys(flags).map(id=>[id,document.getElementById('exp_'+id).checked]))});
}
