# Tracking options comparison

Controlled 640-pixel-wide still-image stream generated at 60 FPS, two-hand crossed-hands fixture, same browser and hardware. Eight sequential cases, 4 seconds settling plus approximately 10 seconds sampled each. These are exploratory single-run measurements, not your physical camera or an accuracy benchmark. GPU warmup and run order can affect results. Frame age is capture-to-result processing time, not full sensor-to-screen latency.

| Case | Hand FPS | Inference ms | Frame age ms | Model CPU ms |
|---|---:|---:|---:|---:|
| Baseline | 27.40 | 24.08 | 26.43 | 0.76 |
| Face 12 / shoulders 8 | 27.45 | 18.95 | 21.37 | 0.78 |
| Fresh frames | 30.10 | 21.24 | 23.04 | 0.77 |
| Prediction | 27.55 | 21.24 | 23.90 | 0.75 |
| Return blend | 27.60 | 20.40 | 23.45 | 0.81 |
| Joint jitter | 27.55 | 23.30 | 26.05 | 0.82 |
| Width 320 | 27.50 | 18.83 | 22.14 | 0.81 |
| Width 640 | 27.60 | 18.39 | 21.42 | 0.80 |

Scene remained 56.1–56.6 FPS. Prediction/blending were not exercised by deliberate occlusion in this throughput fixture; their correctness has separate synthetic gap tests. No accuracy improvement is claimed from throughput. Keep 480 as the default until testing actual camera quality. The reduced-workload option also provides optional-in-effect 60 ms head interpolation; the original throughput row above was measured before that interpolation was included.

## Separate deterministic behavior checks

- Adaptive per-joint filter: 0.7-degree sinusoidal input noise yielded 0.494 degrees RMS unfiltered and 0 degrees after the 1.5-degree dead zone. A 30-degree step reached 90% after 16.7 ms unfiltered versus 50 ms filtered at 60 Hz. This is a constructed signal, not measured camera accuracy.

- Recovery blend: a constructed position discontinuity after occlusion decreased from 32.43 px to 4.27 px in its first return frame (1280-pixel normalized width), and finishes blending after 100 ms. Prediction is bounded to 150 ms movement and the existing grace timeout.

- Combined fresh frames + reduced head workload + 60 ms head smoothing spot check: camera 59 FPS, hands 29 FPS, face 12 FPS, shoulders 8 FPS, scene 56 FPS, model CPU 0.86 ms. This is one spot check, not an average.

Use Hand tracking > Tracking performance experiments to toggle each option and run the same comparison against your live camera. Prediction and independent finger-jitter controls remain below that section. All experimental scheduler/resolution controls start off; the prior prediction and jitter defaults are preserved. No historical snapshot files were modified.



## Low-latency defaults update

Fresh-frame dispatch and reduced auxiliary rates now start enabled. After hand inference returns, a newer camera frame can start immediately, without queuing or repeating a frame. Preview is capped to 640 pixels and 30 draws/second.

Same-session two-hand still-fixture spot comparison (five samples, two seconds apart per condition): controls off hand FPS 30,29,31,30,31 (mean 30.2); controls on 49,50,48,51,48 (mean 49.2). Scene remained 60 FPS. Face/shoulder rates changed from 20/20 to 12/8. This is a local controlled comparison, not the user camera, motion accuracy, or a guarantee of hardware performance. Both conditions include the smaller preview.

Camera capture also verifies returned FPS and retries silently downgraded 60 FPS requests. Unsupported cameras retain their supported fallback; 30 FPS is never relabeled as 60. Five capture tests and a worker scheduling test pass.
