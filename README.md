# RPS Hand

> **Public demo repository.** The repository root is the built static site served by GitHub Pages (no build step, no server). **Source code, tests and the desktop app are private; available on request** (zalyatovdamiredominic@gmail.com).

## The problem

Hand-gesture games usually need special hardware or a native app. This project asks how far a plain webcam and a browser can go: track the 21 joints of a hand in real time, read a gesture, and drive a rigged 3D hand from it, with no install and no server that sees the camera.

Rock-paper-scissors in the browser with live hand tracking: MediaPipe finds the 21 joints of your hand and a rigged 3D hand copies the pose in real time.

![Demo: a tracked hand goes from scissors to paper to rock and the rigged 3D hand beside it copies each pose](demo.gif)

**Live demo:** https://dominicdamire.github.io/rps-hand-demo/ · no camera? [Try the sample image](https://dominicdamire.github.io/rps-hand-demo/?img=victory.jpg)

![RPS Hand in sample mode: the tracked peace sign on the left, the 3D hand copying it on the right](screens/home.png)

<img src="screenshot-mobile.png" alt="The same page on a 390 px wide phone screen" width="240">

## Modes

Later work built on the same tracker, all running in the browser. The [live page](https://dominicdamire.github.io/rps-hand-demo/#modes) lists them below the game.

| | |
|---|---|
| <a href="https://dominicdamire.github.io/rps-hand-demo/hand-pnp-photo/?v=motion5"><img src="modes/pnp-depth-lab.png" alt="PnP depth lab" width="260"></a> | **[PnP depth lab](https://dominicdamire.github.io/rps-hand-demo/hand-pnp-photo/?v=motion5)**<br>Palm pose from a single camera by PnP depth: a fixed-size rigged 3D hand copies your tracked hand live next to a tracked alien head, with a pixel-error readout.<br><sub>Camera</sub> |
| <a href="https://dominicdamire.github.io/rps-hand-demo/hand-demo/"><img src="modes/alien-head-lab.png" alt="Alien head lab" width="260"></a> | **[Alien head lab](https://dominicdamire.github.io/rps-hand-demo/hand-demo/)**<br>Face and hands tracked together: a 3D alien head, neck and shoulders beside the hands, plus one-hand sweep and depth experiments. Has a sample image.<br><sub>Camera or sample</sub> |
| <a href="https://dominicdamire.github.io/rps-hand-demo/hand-ninja/"><img src="modes/hand-ninja.png" alt="Hand Ninja" width="260"></a> | **[Hand Ninja](https://dominicdamire.github.io/rps-hand-demo/hand-ninja/)**<br>Fruit Ninja with bare hands: a phone tracks your hands, a PC shows the fruit; pair them with a code or QR. Fast passes slice, fists crush.<br><sub>Phone + PC</sub> |
| <a href="https://dominicdamire.github.io/rps-hand-demo/movement/"><img src="modes/movement.png" alt="Movement" width="260"></a> | **[Movement](https://dominicdamire.github.io/rps-hand-demo/movement/)**<br>Walk, shoot and punch a bag with a finger joystick and head look, on a flat test floor, with a phone-as-camera link.<br><sub>Camera</sub> |
| <a href="https://dominicdamire.github.io/rps-hand-demo/hand-range/?v=range1"><img src="modes/shooting-range.png" alt="Shooting range" width="260"></a> | **[Shooting range](https://dominicdamire.github.io/rps-hand-demo/hand-range/?v=range1)**<br>First-person range with two tracked hands, a head-tracked view, a pistol with a saved grip and five targets.<br><sub>Camera</sub> |
| <a href="https://dominicdamire.github.io/rps-hand-demo/hand-pnp-gun/?v=motion5"><img src="modes/pnp-gun-lab.png" alt="PnP gun lab" width="260"></a> | **[PnP gun lab](https://dominicdamire.github.io/rps-hand-demo/hand-pnp-gun/?v=motion5)**<br>The PnP hand with a pistol: pick it up by closing three fingers, bend the index to fire.<br><sub>Camera</sub> |
| <a href="https://dominicdamire.github.io/rps-hand-demo/gun-lab/"><img src="modes/gun-grip-lab.png" alt="Gun grip lab" width="260"></a> | **[Gun grip lab](https://dominicdamire.github.io/rps-hand-demo/gun-lab/)**<br>Pose every finger joint of the gun grip, preview it on the 3D hand and export it as JSON. No camera needed; a camera range is linked from the page.<br><sub>No camera needed</sub> |

A camera mode needs camera access on HTTPS or `localhost`; the lab pages also have a sample-image button. Hand Ninja pairs two browsers through the public PeerJS broker, so it needs internet access but no server of ours.

## What it does

- Tracks one hand from the front camera with MediaPipe HandLandmarker in a Web Worker (GPU, with a CPU fallback) and draws the landmarks over the mirrored video.
- Reads the gesture from the extended fingers: none up = rock, three or more = paper, index and middle only = scissors.
- Plays a round against a random opponent whose move is drawn when you press **Play round**. After a 3-second countdown it scores only a gesture that is still being tracked (seen within the last 500 ms, or within 2.5 result intervals on a slower tracker) and held for at least 400 ms; otherwise it asks you to retry and leaves the score unchanged.
- Drives a rigged, textured 3D hand with a short forearm (three.js) from the tracked joints. **VIEW** switches between a mirror view and a first-person view projected from your head position (MediaPipe PoseLandmarker in a second worker).
- Works without a camera: `?img=victory.jpg` feeds a still photo through the same tracker. If camera access is denied, the page offers the sample and a retry button.
- Fits phone screens (camera and 3D panes side by side in a strip, controls below, 44 px buttons, the whole camera frame visible) and levels the 3D room with the phone's tilt sensor.
- Camera frames stay in the browser; only the libraries and models are downloaded from a CDN.

URL parameters: `img=<file>` (still image instead of the camera), `video=test/rps.webm` (looping clip), `view=0|1` (first person / mirror), `hands=2` (track two hands; a round needs exactly one), `gun=1` (a pistol on the table that the tracked hand can pick up and fire), `delegate=CPU`, `lines=1` (skeleton over the 3D hand).

## Tech

HTML and ES modules with no build step · three.js 0.186 · MediaPipe Tasks Vision 1.0.1 (HandLandmarker, PoseLandmarker) · Web Workers · GitHub Pages · Node test runner and Playwright · desktop version: Python, MediaPipe GestureRecognizer, OpenCV, pygame and PyOpenGL.

## Architecture

Plain HTML and ES modules. Tracking runs in Web Workers (MediaPipe HandLandmarker, plus PoseLandmarker for the head-tracked view); three.js renders the rigged hand; game rules live in `rps-game.mjs` and the UI in `rps-ui.mjs`. Each lab is a self-contained folder (`hand-pnp-photo/`, `hand-demo/`, `hand-ninja/`, `movement/`, `hand-range/`, `gun-lab/`, ...). Hand Ninja pairs two browsers through the public PeerJS broker; the movement demo links a phone camera over MQTT. Camera frames never leave the browser.

## Screens

Captured from the live demo with headless Chrome.

| | |
|---|---|
| ![Home, sample-image mode](screens/home.png) | ![Gun grip lab](screens/gun-lab.png) |
| ![Alien head lab](screens/hand-demo.png) | ![Movement](screens/movement.png) |

## Tests

Counts from the private source repository (found by searching the test files; not re-run for this page): 230 Node test files with 541 `test(` / `it(` cases (round rules, tracking maths, lab modules), plus Playwright browser checks run in CI (real tracker reads SCISSORS from the sample photo, VIEW toggle, no overflow at 390 px, rig alignment) and a desktop self-check script. The test files are not part of this demo.

## Credits

This work started as a fork of the team project **[tagirz500/hands-lapse](https://github.com/tagirz500/hands-lapse)** (first published as `rps-hand`) by **tagirz500** and **ArmanFardin**. Their commits are kept in this history as they authored them.

- **tagirz500** built the original web hand tracker (HandLandmarker in a worker, One Euro filtering with prediction, 3D hand placement from world and image landmarks, two hands with Rapier physics, a first-person view) and its tuning builds, the Python desktop app and its test, the web test harness and test-media script, and in the movement demo the phone-as-camera QR link and multiplayer.
- **ArmanFardin** built the movement prototype (walking with map collisions and stair stepping, the camera thumb joystick, head-look turning and their tests).

**Damire Zalyatov's additions** to the team project:

- Rigged 3D hand and arm models driven by the tracked joints (a hand scan and textured arms, `*.glb`), with a solid-hand solver and finger collisions.
- Head-tracked first-person view, face and upper-body tracking, avatar, 3D mirror and calibration (`head`, `body`, `avatar`).
- A pistol on the table that the tracked hand can pick up and fire (`gun.mjs`), plus gun-grip and shooting-range labs.
- Movement versions 63 to 90: shooting range, punching bag, synthesized sounds, wall mirror, the ball-joint doll as the player's body (`doll`, `tools/doll`) and a phone link that sends landmarks over MQTT, so it works across networks.
- QR phone-camera pairing for the labs (`shared-phone`).
- Hand-tracking geometry labs (`hand-*`): PnP and sweep fits, depth experiments, touch calibration and joint limits.
- The playable round layer (`rps-game.mjs`, `rps-ui.mjs`), the mobile layout, camera-denial recovery, the browser tests and CI.

**Third-party components:** [MediaPipe](https://github.com/google-ai-edge/mediapipe) (Apache-2.0) for hand, face and pose tracking, [three.js](https://threejs.org) and three-mesh-bvh (MIT), [PeerJS](https://peerjs.com) and QRCode.js (MIT) for the phone pairing. **Hand Ninja** (`hand-ninja/`) was first published as [tagirz500/hand-ninja](https://github.com/tagirz500/hand-ninja); its files are copied here (one comment reworded).

## Licence

Neither the upstream project nor this work has a licence file, so the project code is not licensed for reuse; copyright stays with its authors. Third-party parts keep their own licences: MediaPipe (Apache-2.0, text in `head/`), three.js and MediaPipe Tasks Vision (loaded from jsDelivr), MQTT.js and QRCode.js (both MIT, with their licence texts next to the files in `vendor/`). Most test photos and clips in `test/` come from Wikimedia Commons (listed in `fetch_test_media.py`). The hand-scan meshes (`hand*.glb`) were rigged from a 3D scan of a real hand (hand1.OBJ) supplied by the project owner.

## Status / limits

Experimental. The modes above were opened in Chrome with a fake camera fed from a still photo, so tracking quality on a real webcam or phone is unmeasured; Hand Ninja has no automated test in this repository. CI checks one sample photo (`victory.jpg`) in headless Chromium; tracking accuracy and frame rate on real phones have not been measured, and the desktop app has only been checked on still images (`test_rps_hand.py`), not with a live webcam.

Maintained by Damire Zalyatov · base project by tagirz500 and ArmanFardin.
