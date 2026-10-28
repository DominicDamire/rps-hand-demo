# Video Depth 2

Phone QR receiver plus official Metric Video Depth Anything Small, running on local CPU or DirectML GPU. GPU is selected by default in the page; unavailable GPU runtime is reported, not silently relabelled CPU. setup-vda-gpu.ps1 installs a separate Python 3.12 / torch 2.4.1 DirectML environment. prepare_directml.py skips autocast in FP32 only. Start script prefers that environment.

Frame resizing bounds both dimensions at 640, including portrait phone video. Real 360x640 and 640x360 inference tested. No artificial 200 ms scheduling pause; one request in flight. GPU tested on AMD RX 6600 with real outputs and CPU/GPU/quality switching. Cold frames are slower and throughput depends on load.

Depth contribution 0–100%, default 25%, enable checkbox off by default. 100% uses only the anchored depth map after initialization and holds last map depth on stale/unreliable observations; it does not fall back to palm depth. Lower percentages blend with palm depth; unusable maps fall back to palm. The initial map scale is anchored to the current placement, so this is relative map motion rather than absolute sensor distance. Optional sweep and shoulder distance reference apply to both hands/bust; collision and rear-plane constraints still apply afterward.

The engine serves the local preview at 127.0.0.1:8788. QR URLs always point at the public HTTPS phone sender, not localhost. Camera frames are neither saved nor uploaded by this engine. Browser privacy rules can block the public page from calling the local engine; use its direct PC preview in that case.

Tests cover 0/50/100 percent blending, stale full-map hold despite changing palm depth, source/pose rejection, shoulder calibration invariance, phone stream receiving without PC getUserMedia, public QR routing and real portrait/landscape inference. Live tracking accuracy still requires user testing.
