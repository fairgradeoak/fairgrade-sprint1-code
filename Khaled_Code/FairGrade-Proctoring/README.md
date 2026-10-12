# FairGrade — Khaled's proctoring subsystem

**Delivery status: implemented prototype with tested core logic and local API. Not a verified production deployment.** The live vision models, real webcam behavior, S3/RDS integration, and human false-positive measurements require the checks below. See `docs/STATUS.md` for the exact task-by-task status.

Your responsibility is the student webcam → detection → evidence → instructor review workflow. Omar owns the authenticated cloud APIs, S3 storage, and database integration; Ahmed's grading work is separate. A flag supports human review and must not automatically change a grade.

## Run the local demonstration

Install Node.js 22 or newer, then open a terminal in this folder:

```sh
npm start
```

Open **http://localhost:4173**. Select **Synthetic demonstration**, tick the consent box, and start. Wait for `MONITORING` (7.5-second warmup). Select `Phone present` and keep the tab visible. A flag takes 2 seconds, then the recorder collects 7.5 seconds after it and spends approximately 15 seconds encoding the clip. Open **Instructor review**, load `demo-exam`, play the clip, and confirm or dismiss it.

The local demonstration needs **no npm install and no model download**. It generates labeled synthetic footage and does **not** exercise the vision models or webcam. Local clips and event records are stored in `data/`. Never deploy this demo server for real students: its role header is intentionally a mock, not authentication.

## Enable the actual webcam models

Follow `docs/MODELS.md` to export a pretrained YOLOv8n TF.js graph, then run:

```sh
npm run setup:models -- --yolo-dir PATH_TO_YOLOV8N_WEB_MODEL
npm start
```

Choose **Live webcam + models**, consent, grant camera permission, then **Capture face reference**. Models run locally; no camera frames are sent to a model service. This mode requires local model files and a browser supporting MediaRecorder, dedicated workers, and MediaPipe WASM. Target desktop Chrome/Edge; other browsers need explicit compatibility validation. Live inference was not executed in the authoring environment because dependency/model downloads were blocked.

## Validate

```sh
npm test
npm run check
node scripts/browser-test.mjs
node scripts/evaluate.mjs evaluation/results.json
```

The browser test uses installed Chrome on Windows by default. Set `BROWSER_EXE` to another Chromium executable when needed. It creates only synthetic footage in a temporary, isolated profile. Browser reports appear in `test-results/`. Automated tests are not empirical accuracy results.

## What's included

| Area | Files |
|---|---|
| Student UI, consent, session state, notifications | `public/index.html`, `public/app.mjs` |
| Face detection and mesh worker | `public/workers/face-worker.mjs` |
| YOLOv8n TF.js worker and postprocessing | `public/workers/object-worker.js`, `public/core/yolo.mjs` |
| Identity enrollment and face-api.js matching | `public/core/detectors.mjs` |
| Debouncing, cooldown, stale-sample handling | `public/core/triggers.mjs` |
| Rolling buffer and complete video encoding | `public/core/window.mjs`, `public/core/recorder.mjs` |
| Real API adapter and local mock server | `public/core/api.mjs`, `server/server.mjs` |
| Instructor playback, confirm/dismiss | `public/review.html`, `public/review.mjs` |
| Integration contract and retention templates | `docs/BACKEND-CONTRACT.md`, `infra/` |
| Role explanation and learning exercises | `docs/KHALED-GUIDE.md` |
| Human evaluation and team messages | `docs/EVALUATION.md`, `docs/TEAM-HANDOFF.md` |

## Material limits

- The three referenced attachments could not be retrieved. This implements the pasted task list, not a verified interpretation of the proposal or SRS.
- Model assets are not bundled. The setup/export recipe and model adapters need live validation. No vision accuracy, identity accuracy, or target-device performance is claimed.
- The rolling buffer stores video-only JPEG frames at a target of 10 fps. Complete clips target 15 seconds; timing is measured and tolerances are explicit. Encoding happens in real time after collection, adding about 15 seconds to delivery. This is a prototype tradeoff, not a guaranteed production performance result.
- Stop, camera disconnect, or a hidden tab ends monitoring and cancels pending/encoding clips. A clip already uploading may complete. Failed-submission clips remain in page memory for retry and disappear on page close. No durable offline queue is implemented.
- Up to three pending/encoding clips and three failed submissions are retained. Capacity errors are visible and recorded. Long-running load tests are still required.
- Identity matching checks continuity with the session's self-captured reference. It does not establish the student's official identity or prevent photo/video spoofing.
- Thresholds are starting values, not scientifically calibrated values. Head orientation and facial expressions are displayed as landmarks only; they are not cheating classifications.
- The real retention duration is unknown. The local demo uses 30 days as an explicitly provisional setting. Cloud templates are not applied. Live mode is blocked until `retentionPolicyConfirmed` is true.

To finish integration, provide the actual documents, existing repository, Omar's API/authentication contract, a test account/environment, and approved retention policy. Do not put AWS credentials into frontend files.
