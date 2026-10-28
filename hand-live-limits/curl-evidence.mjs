// A short projected base-to-tip span relative to the tracked finger path is
// evidence of a fold, even when a single camera cannot resolve its depth sign.
export function projectedFingerClosure(landmarks, base, aspect) {
  if (!landmarks || !landmarks[base + 3]) return 1;
  const distance = (a, b) => Math.hypot((landmarks[a].x - landmarks[b].x) * aspect, landmarks[a].y - landmarks[b].y);
  const path = distance(base, base + 1) + distance(base + 1, base + 2) + distance(base + 2, base + 3);
  return path > 1e-6 ? distance(base, base + 3) / path : 1;
}

export function hasVisibleCurl(landmarks, base, aspect, threshold = 0.72) {
  return projectedFingerClosure(landmarks, base, aspect) < threshold;
}
