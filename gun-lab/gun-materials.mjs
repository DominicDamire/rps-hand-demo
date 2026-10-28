// The asset marks even solid metal as BLEND. Keep only sight glass transparent.
export function gunMaterials(model, ghost = false) {
  const seen = new Set();
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const glass = mat.name === "Glass";
      const transparent = ghost || glass;
      if (mat.transparent !== transparent) mat.needsUpdate = true;
      mat.transparent = transparent;
      mat.opacity = ghost ? 0.25 : 1;
      mat.depthWrite = !transparent;
    }
  });
}
