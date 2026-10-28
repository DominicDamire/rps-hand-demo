export function installLineDepthControls(container){
 container.innerHTML=`<h2>2D finger lines + estimated 3D depth</h2>
 <label><input id="lineDepthEnabled" type="checkbox" checked> Estimate finger depth from photo lengths</label>
 <p>Keeps the photo's segment lengths. Shortened image lines estimate depth; tracked depth chooses the bend direction. Finger roots remain attached to the palm. Sweep positions the whole hand.</p>
 <label><input id="lineContactEnabled" type="checkbox" checked> Close the OK sign in 3D</label>
 <label>OK contact begins within (preview pixels)<input id="lineEnter" type="number" min="0" max="100" step="1" value="35"></label>
 <label>OK contact releases beyond (preview pixels)<input id="lineRelease" type="number" min="0" max="150" step="1" value="50"></label>
 <p>Uses the tracked thumb and index tips to detect contact. Both fingers can adjust their bends to meet; roots and segment lengths stay fixed. A remaining gap is reported if the solver cannot close it. Screen overlap alone is a contact assumption.</p>
 <p>Turn both switches off to compare with the flat, attached-root version. These are the only added finger assists. No bend limits, curl presets, or finger smoothing are enabled.</p>
 <p>When photo lengths and image measurements disagree, the model preserves segment length and reports the line mismatch. First-person view is in the Camera tab.</p>
 <p id="lineCopyMetrics" role="status">Waiting for a tracked hand.</p>
 <p id="lineDepthStatus" role="status"></p>`;
 const enter=container.querySelector('#lineEnter'),release=container.querySelector('#lineRelease');
 function validate(){
  enter.value=String(Math.max(0,Math.min(100,Number(enter.value)||0)));
  release.value=String(Math.max(+enter.value,Math.min(150,Number(release.value)||0)));
 }
 enter.addEventListener('change',validate);release.addEventListener('change',validate);
}
