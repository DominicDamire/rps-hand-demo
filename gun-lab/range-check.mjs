// Test-only fixture replay through the real range handler; no webcam is opened.
import { packHands, unpackHands } from "../movement/link.mjs?v=91";
export async function verifyRange({
  accept,
  begin,
  snapshot,
  resetScore,
  checkTargetRays,
}) {
  const output = document.createElement("pre");
  output.id = "rangeCheck";
  output.setAttribute("role", "status");
  Object.assign(output.style, {
    position: "fixed",
    top: "75px",
    left: "20px",
    zIndex: 20,
    background: "#10232a",
    color: "#b7efd2",
    padding: "15px",
    maxWidth: "90vw",
    whiteSpace: "pre-wrap",
  });
  document.body.append(output);
  output.textContent = "Testing pickup, shooting, tracking loss and release…";
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    assert = (value, message) => {
      if (!value) throw Error(message);
    };
  function packet(lower, index) {
    const p = Array.from({ length: 21 }, () => [0, 0, 0]);
    p[0] = [0, -0.1, 0];
    for (let f = 0; f < 5; f++) {
      const a = ((f === 0 ? 40 : f === 1 ? index : lower) * Math.PI) / 180,
        i = 1 + 4 * f;
      p[i] = [f * 0.02, 0, 0];
      p[i + 1] = [f * 0.02, 0.03, 0];
      p[i + 2] = [f * 0.02, 0.03 + 0.03 * Math.cos(a), 0.03 * Math.sin(a)];
      p[i + 3] = [f * 0.02, 0.03 + 0.06 * Math.cos(a), 0.06 * Math.sin(a)];
    }
    const landmarks = p.map(([x, y, z]) => ({
      x: 0.5 + x * 2,
      y: 0.5 - y * 2,
      z,
    }));
    landmarks[0].x = 0.5;
    landmarks[0].y = 0.45;
    return {
      task: "hands",
      worldLandmarks: [p.map(([x, y, z]) => ({ x, y, z }))],
      landmarks: [landmarks],
      handedness: [[{ categoryName: "Right", score: 0.99 }]],
      inferenceMs: 0,
    };
  }
  const send = (lower, index) => accept(packet(lower, index), canvas);
  try {
    begin();
    assert(
      snapshot().distances.join(",") === "2,3,5,7,10",
      "Target distances incorrect",
    );
    assert(
      checkTargetRays().every(Boolean),
      "A target is occluded or outside shot range",
    );
    send(80, 0);
    await wait(150);
    send(80, 0);
    assert(snapshot().held, "Did not pick up");
    await wait(40);
    send(80, 0);
    await wait(100);
    send(80, 90);
    assert(snapshot().shots === 1, "First press did not shoot");
    await wait(40);
    send(80, 90);
    assert(snapshot().shots === 1, "Held press repeated");
    const hits = snapshot().hits;
    assert(hits === 1, "Barrel ray missed the centered test target");
    accept(
      { task: "hands", landmarks: [], worldLandmarks: [], handedness: [] },
      canvas,
    );
    assert(snapshot().held, "Tracking loss dropped gun");
    await wait(40);
    send(80, 90);
    assert(snapshot().shots === 1, "Reacquisition fired");
    send(0, 0);
    await wait(235);
    send(0, 0);
    assert(!snapshot().held, "Opening fingers did not release");
    resetScore();
    assert(
      snapshot().shots === 0 && snapshot().hits === 0,
      "Score reset failed",
    );
    const phoneFrame = { width: 640, height: 480, landmarksOnly: true };
    const phoneSend = (index) =>
      accept(
        { ...unpackHands(packHands(packet(80, index))), task: "hands" },
        phoneFrame,
      );
    phoneSend(0);
    await wait(150);
    phoneSend(0);
    assert(snapshot().held, "Phone landmarks did not pick up");
    await wait(40);
    phoneSend(0);
    await wait(100);
    phoneSend(90);
    assert(
      snapshot().shots === 1 && snapshot().hits === 1,
      "Phone landmarks did not shoot and hit",
    );
    resetScore();
    output.textContent = JSON.stringify(
      {
        status: "PASS",
        pickup: true,
        shots: 1,
        hits,
        heldPressSuppressed: true,
        trackingLossHeldGrip: true,
        reacquisitionSuppressed: true,
        openHandReleased: true,
        fiveDistancesReachable: true,
        scoreReset: true,
        phonePacketPickupAndHit: true,
      },
      null,
      2,
    );
  } catch (e) {
    output.textContent = "FAIL: " + e.message;
  }
}
