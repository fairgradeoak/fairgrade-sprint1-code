# Model setup and reproducibility

No model weights or third-party runtimes are bundled in this source delivery. Downloads were blocked in the authoring environment. Run setup on your own development machine with internet access. Live model loading and inference have not been validated in this delivery.

## 1. Export the required YOLOv8n model

Use a separate Python environment (Linux/WSL is often easier for the converter stack). Install an export-capable historical Ultralytics version and TensorFlow.js converter:

```sh
python -m venv .venv
# Activate this environment using the command for your OS/shell.
python -m pip install "ultralytics==8.3.0" "tensorflowjs==4.22.0"
python scripts/export_yolo.py
```

The exporter may request additional conversion dependencies. This recipe is provided for reproducibility work, **not claimed as a validated environment lock**. Save `pip freeze` with your successful model export and record the YOLO source-weight hash.

Expected output is `yolov8n_web_model/` containing `model.json` and binary shards. The input must be NHWC `[1,640,640,3]`, batch 1. Output must be a single raw COCO detect tensor with 84 channels (4 coordinates and 80 class scores), without embedded NMS. Incompatible models fail with a visible error; they are not silently interpreted as valid.

Why the historical version? Current Ultralytics documentation says TF.js export was replaced by LiteRT beginning with 8.4.83. An unpinned current `format="tfjs"` export can produce a different format. The code here intentionally implements the YOLOv8n + TensorFlow.js task you were assigned; changing runtime requires a separate team decision.

## 2. Fetch browser runtimes and other models

From the source root:

```sh
npm run setup:models -- --yolo-dir PATH_TO_YOLOV8N_WEB_MODEL
```

The script downloads pinned MediaPipe 0.10.21, TensorFlow.js 4.22.0, face-api.js 0.22.2, MediaPipe float16 model version 1, and face-api.js recognition/tiny detector/tiny landmark weights from the v0.22.2 source tag. It copies the local YOLO export and writes SHA-256 file hashes and source URLs to `public/models/provenance.json`.

Review third-party code/model license files before distributing assets. The original face-api.js project is an older dependency; keep its runtime isolated from YOLO's TF.js 4 worker and assess dependency maintenance before production. Ultralytics offers its own licensing terms; the team must select the appropriate distribution arrangement.

Hashes record what was downloaded; they are not signatures and are not compared against a preapproved checksum catalog. For a release, verify assets independently, commit a trusted hash manifest, and self-host them with the application.

## 3. Live acceptance checks

1. Open the camera mode. Verify all three model families load from same-origin files with no camera-frame network requests.
2. Confirm face rectangles and mesh points follow a face, including a second consenting person.
3. Show a phone from multiple angles and distances. Confirm box coordinates align on both 4:3 and 16:9 cameras. A COCO model can miss partially occluded phones.
4. Enroll one consenting participant, test their continuity, then swap to a consenting volunteer. Log both false accepts and false rejects.
5. Run all detectors for at least 15 minutes. Record inference latency distributions, UI responsiveness, memory, frame gaps, and thermal throttling on the target laptop.
6. Revoke camera permission, unplug it, hide the tab, stop during startup/enrollment/capture, and reload with failed uploads. Confirm the visible status accurately describes what stopped or was lost.
7. Confirm every flag is linked to the correct playable clip and UTC time. Verify the 7.5-second boundaries using an on-camera stopwatch.

Passing these is necessary before claiming live detection works. No model or threshold is guaranteed to detect every relevant event.
