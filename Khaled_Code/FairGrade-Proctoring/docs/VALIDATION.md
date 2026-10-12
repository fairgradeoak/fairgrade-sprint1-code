# Validation record — 6 October 2026

## Passed

| Check | Result | Scope |
|---|---|---|
| Node automated suite | 15/15 passed | Trigger/window/YOLO postprocessing/API/local persistence/retention behavior |
| JavaScript syntax | 17 files checked, no syntax errors | Source and test JS present at the final check |
| Synthetic Chromium browser flow | 9/9 checks passed | Consent → pre-roll → phone signal → encode → local PUT → event → playback → instructor confirmation |
| Review mobile width | Passed at 390px viewport | Horizontal overflow check |
| Student/review visual inspection | Passed | Desktop screenshots inspected for clipping/overlap and legible controls |
| Evaluation summarizer | 0 completed trials, rates unknown | Correctly does not invent data from uncompleted templates |

The browser report is included in `evidence/browser-report.json`. UI screenshots are included in `evidence/student.png` and `evidence/review.png`. The actual synthetic evidence video is `evidence/synthetic-sample.webm`. The run used Node 24.15.0 and Chrome 154.0.8037.98 on Windows in a disposable headless profile.

## Measured clip in the synthetic browser run

| Measurement | Value |
|---|---:|
| Requested pre-trigger footage | 7,500 ms |
| Requested post-trigger footage | 7,500 ms |
| Source duration selected for encoding | 15,000 ms |
| Encoder elapsed time | 15,002.3 ms |
| Browser-decoded video duration | 14.940276 s |
| Largest source-frame gap | 126.7 ms |
| Largest replay-loop gap | 63.8 ms |
| Decoded resolution | 640 × 480 |
| Uncaught browser exceptions | 0 |

Encoding is frame-sampled and not an exact 15.000-second container guarantee. The observed duration difference is about 60 ms. The agreed SRS must state whether the provided tolerance is acceptable.

## Issues found and resolved during verification

- Native browser `fetch` raised an illegal-invocation error when stored as an object method. Binding it to the global receiver fixed the upload path. A regression test was added, and the browser flow then passed.
- The restricted host prevented renderer initialization under the installed browser's normal sandbox in both Chrome and Edge. The successful test used `FAIRGRADE_TEST_NO_SANDBOX=1` for an isolated headless profile opening only this local synthetic app. Normal application operation does not disable the user's browser sandbox. The test override is optional and should not be used for untrusted sites.

## Not verified

- Model downloads/export, MediaPipe inference, YOLO inference, face-api.js inference, or cross-runtime performance on a real camera.
- Empirical detection or identity accuracy, threshold tuning gains, or false-positive/false-negative rates.
- Real S3 upload/privacy, RDS persistence, backend authentication/authorization, cloud retention, or applied Terraform/SQL.
- Other browsers, prolonged/overlapping-event load, real camera interruptions, every retry/failure condition, or sustained thermal behavior.
- Compliance with the unavailable proposal/SRS, especially audio, trusted enrollment, liveness, exact timing tolerance, monitoring continuity, and institutional privacy wording.

The local server's role checks exercise protocol behavior but are not security testing of a real identity system. Passing these tests is evidence about the tested paths, not a guarantee of correctness in all conditions.
