// Version-1 JSON stores XYZ in the old rig basis. Display anatomical thumb
// controls without reinterpreting old files or rotating the user's saved pose.
export function jointAxes(name) {
  return name.startsWith("Thumb")
    ? [
        { name: "Bend", axis: 1, sign: name === "Thumb1" ? 1 : -1 },
        { name: "Sideways", axis: 0, sign: 1 },
        { name: "Twist", axis: 2, sign: 1 },
      ]
    : ["Bend", "Sideways", "Twist"].map((name, axis) => ({
        name,
        axis,
        sign: 1,
      }));
}
