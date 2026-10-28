import { validateProfile } from "./profile.mjs?v=2";
export function providedProfile(released, pressed, raised) {
  const a = validateProfile(released),
    b = validateProfile(pressed),
    c = validateProfile(raised);
  // JSON 2 supplies released index; JSON 4 supplies pressed index, thumb stop,
  // and assembly placement. The earlier raised thumb is the outward endpoint.
  const out = structuredClone(b);
  out.indexPressed = {};
  out.thumbOpen = {};
  for (let k = 1; k <= 3; k++) {
    out.angles["Index" + k] = [...a.angles["Index" + k]];
    out.indexPressed["Index" + k] = [...b.angles["Index" + k]];
    out.thumbOpen["Thumb" + k] = [...c.angles["Thumb" + k]];
  }
  return validateProfile(out);
}
export async function loadProvidedProfile() {
  const load = async (file) => {
    const r = await fetch(new URL(file + "?v=2", import.meta.url));
    if (!r.ok) throw Error("Could not load " + file);
    return r.json();
  };
  const [released, pressed, raised] = await Promise.all(
    ["released-grip.json", "pressed-grip.json", "thumb-up-grip.json"].map(load),
  );
  return providedProfile(released, pressed, raised);
}
