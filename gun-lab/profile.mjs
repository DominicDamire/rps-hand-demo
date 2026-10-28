export const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
export const JOINTS = FINGERS.flatMap((f) => [1, 2, 3].map((k) => f + k));
export function defaults() {
  return {
    schema: "gun-grip-lab",
    version: 1,
    rig: "sweep-doll",
    name: "My gun grip",
    side: "R",
    hand: { position: [-38, 65, -175], rotation: [0, 0, 0], scale: 1 },
    gun: { position: [0, 0, 0], rotation: [0, 180, 0], scale: 1 },
    thickness: 1.3,
    angles: Object.fromEntries(
      JOINTS.map((n) => [
        n,
        n.startsWith("Thumb")
          ? [0, 0, 0]
          : n.startsWith("Index")
            ? [0, 0, 0]
            : [n.endsWith("1") ? 65 : n.endsWith("2") ? 90 : 75, 0, 0],
      ]),
    ),
    trigger: {
      released: 10,
      pressed: 75,
      on: 0.7,
      off: 0.35,
      smoothing: 35,
      gain: 1,
    },
  };
}
export function validateProfile(value) {
  const out = defaults(),
    num = (v, min, max) =>
      typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (
    value?.schema !== out.schema ||
    value.version !== 1 ||
    value.rig !== out.rig
  )
    throw Error("Use a Gun Grip Lab version 1 preset.");
  if (!["R", "L"].includes(value.side)) throw Error("Invalid hand side.");
  out.side = value.side;
  if (typeof value.name !== "string" || value.name.length > 80)
    throw Error("Preset name must be at most 80 characters.");
  out.name = value.name;
  for (const target of ["hand", "gun"]) {
    for (const [key, limit] of [
      ["position", 500],
      ["rotation", 180],
    ]) {
      const a = value[target]?.[key];
      if (
        !Array.isArray(a) ||
        a.length !== 3 ||
        a.some((v) => !num(v, -limit, limit))
      )
        throw Error("Invalid " + target + " " + key);
      out[target][key] = [...a];
    }
    if (!num(value[target]?.scale, 0.25, 2)) throw Error("Invalid scale");
    out[target].scale = value[target].scale;
  }
  if (!num(value.thickness, 0.5, 2)) throw Error("Invalid thickness");
  out.thickness = value.thickness;
  for (const n of JOINTS) {
    const a = value.angles?.[n];
    if (
      !Array.isArray(a) ||
      a.length !== 3 ||
      a.some((v) => !num(v, -180, 180))
    )
      throw Error("Invalid joint " + n);
    out.angles[n] = [...a];
  }
  for (const [key, finger] of [
    ["thumbOpen", "Thumb"],
    ["indexPressed", "Index"],
  ])
    if (value[key] !== undefined) {
      out[key] = {};
      for (let k = 1; k <= 3; k++) {
        const n = finger + k,
          a = value[key]?.[n];
        if (
          !Array.isArray(a) ||
          a.length !== 3 ||
          a.some((v) => !num(v, -180, 180))
        )
          throw Error("Invalid " + key + " endpoint: " + n);
        out[key][n] = [...a];
      }
    }
  for (const [key, min, max] of [
    ["released", 0, 160],
    ["pressed", 0, 160],
    ["on", 0.05, 1],
    ["off", 0, 0.95],
    ["smoothing", 0, 200],
    ["gain", 0, 2],
  ]) {
    if (!num(value.trigger?.[key], min, max))
      throw Error("Invalid trigger " + key);
    out.trigger[key] = value.trigger[key];
  }
  if (out.trigger.pressed - out.trigger.released < 10)
    throw Error("Pressed bend must be at least 10° above released bend.");
  if (out.trigger.on - out.trigger.off < 0.05 - 1e-8)
    throw Error(
      "Press threshold must exceed release threshold by at least 5%.",
    );
  return out;
}
