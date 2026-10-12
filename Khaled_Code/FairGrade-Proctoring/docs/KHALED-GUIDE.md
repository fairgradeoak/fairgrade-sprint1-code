# Khaled's role and practical learning guide

## Your role, briefly

You are FairGrade's browser proctoring developer. You collect a consented webcam stream, run three kinds of computer vision, turn sustained observations into review flags, create short evidence clips, upload them through Omar's backend, and let an instructor review them. You also measure false positives and explain the system's limits in the final report.

You are not responsible for Ahmed's grading algorithm. You share the upload contract, event schema, retention rules, and instructor permissions with Omar. You own proving that your browser code calls those interfaces correctly. A successful local mock test is not proof of cloud integration.

## 1. JavaScript and browser foundations

- A **function** packages behavior. `observe(reason, active, time)` decides whether a signal has persisted long enough.
- An **event listener** reacts to browser activity, such as consent, a click, a camera disconnect, or a recorder completing.
- **DOM APIs** update the page. `textContent` displays untrusted text safely; avoid building HTML from event descriptions.
- A **Promise** represents an unfinished result. `await` waits for it without blocking the entire event loop. `try/catch/finally` handles failure and cleanup.
- A **worker** runs expensive computation away from the UI thread. Frames are transferred as `ImageBitmap` objects and closed after use.

```js
async function openCamera(videoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false
  });
  videoElement.srcObject = stream;
  await videoElement.play();
  return () => stream.getTracks().forEach(track => track.stop());
}
```

The permission prompt belongs to the browser. Your explicit consent screen comes first. Localhost or HTTPS is required. Handle rejected permission, missing camera, and unplugged camera as availability problems. Practice: explain why the camera must stop both on session end and if initialization fails halfway through.

## 2. Face detection vs mesh

**Detection** answers “where are the faces?” and returns rectangles plus confidence information. Multiple rectangles can support a second-face observation. **Landmarks** describe detailed facial points and movement. The MediaPipe Face Landmarker is the current task-based route to the mesh output; the implementation requests up to three faces.

Read `face-worker.mjs`. The detector and landmarker use the same source-frame timestamp. The overlay displays their outputs. Turn your face, wear glasses, change lighting, and observe where detections disappear. A detector cannot see behind your head; absence does not prove misconduct.

An unavailable detector is `unknown`, not zero detected faces. On a worker failure, this prototype stops visibly. In a future production integration, send a separate session-health event to the backend so monitoring outages are visible to instructors.

## 3. YOLO and TensorFlow.js

YOLO predicts boxes and class scores. The pretrained COCO model recognizes `person` (class 0) and `cell phone` (class 67). TensorFlow.js loads its graph/weights and runs inference in the browser.

The worker letterboxes the frame to 640×640 with padding, normalizes pixel values to [0,1], executes the graph, then maps boxes back to the original frame. Non-maximum suppression removes overlapping boxes of the same class. The code checks the expected raw output layout `[1,84,N]` or `[1,N,84]`. YOLOv8's raw detect output does not have the older YOLO objectness channel.

The complete COCO class scores are considered before filtering to phone/person. A cup with its highest score in the cup class must not become a phone merely because it has a weak secondary phone score. Practice: trace the letterbox correction in `yolo.mjs` for a 640×480 source.

## 4. Face embeddings and continuity checks

An embedding is a numerical face representation. face-api.js produces descriptors, and Euclidean distance compares a live descriptor to reference samples. Smaller distance suggests similarity; it is not a probability or proof of identity.

Enrollment captures three usable samples with exactly one sufficiently large face. They live in memory only. The minimum distance to those samples is compared to a provisional 0.55 threshold. No descriptor is sent in event payloads. A missing descriptor or multiple faces gives an unknown match state, not a mismatch.

Practice: use your own consenting face and a consenting volunteer; test matched and mismatched cases at several distances/lighting conditions. Report false accepts and false rejects separately. A self-enrolled impostor can match their own reference; trusted institutional enrollment and liveness are separate, unimplemented requirements.

## 5. Sustained conditions

| Signal | Starting duration | Reset rule |
|---|---:|---|
| Phone | 2 s | Phone disappears, inference unknown, or sample gap >1.5 s |
| Second face | 1.5 s | Returns to at most one face, unknown, or gap |
| Identity mismatch | 3 s | Match, unavailable comparison, or gap |
| No face | 3 s | Face returns, unknown, or gap |

An episode fires once, with a per-reason 30-second cooldown. It must clear before a new episode. Timestamps are monotonic for timing; UTC timestamps are used for persisted events. Slow or stale inference must not accumulate assumed evidence between observations. Practice: run `npm test`, then explain the flicker and stale-sample tests.

## 6. Evidence recording

The rolling buffer retains compressed, timestamped frames in RAM for 17 seconds, capped at 48 MB. At a trigger, it requests `[trigger−7500 ms, trigger+7500 ms]`. It waits for the post-window, selects source frames, then replays them through a canvas into a new MediaRecorder. Each output has its own container header.

This avoids joining arbitrary WebM chunks, which may not be independently playable. Source coverage tolerance is 250 ms at the boundaries; gaps exceeding 500 ms mark the clip incomplete. Replay delays above 500 ms or duration errors above 500 ms reject the encoded clip. Timing metadata is attached for reviewers. A 10-fps sampled video cannot provide infinite timestamp precision.

The buffer is ephemeral; clips are the saved evidence. There is no audio capture. Encoding takes approximately the clip duration, so overall flag-to-upload latency includes collection, encoding, and upload. For production, evaluate WebCodecs plus a vetted muxer or another measured low-latency design if the team needs faster delivery or audio.

## 7. Upload and review

1. Request a short-lived upload URL from Omar's authenticated API.
2. PUT the complete clip to the returned destination with exactly its required headers.
3. Only after success, create the event with the clip object key and timing data.
4. The backend verifies object ownership/existence and enforces idempotency.
5. An authorized instructor obtains a short-lived playback URL and records a decision.

The frontend contains no AWS key. Retries reuse the event UUID. Review version checks prevent one instructor from silently overwriting a newer review. The local server demonstrates this protocol but uses disk/JSON instead of S3/RDS.

## 8. What your report should contain

Describe the design and selected thresholds, the actual model/runtime versions and hashes, target device/browser, test conditions and participants (using aliases), timing measurements, false-positive and false-negative results, failures, privacy decisions, and incomplete integration work. Use the templates in `evaluation/`; do not present synthetic tests as real accuracy results.

## Primary references

- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MediaPipe Face Detector](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js)
- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [Ultralytics YOLOv8](https://docs.ultralytics.com/models/yolov8/)
- [Ultralytics TF.js export status](https://docs.ultralytics.com/integrations/tfjs/)
- [TensorFlow.js graph loading](https://js.tensorflow.org/api/latest/#loadGraphModel)
- [face-api.js project documentation](https://github.com/justadudewhohacks/face-api.js)
- [MDN MediaStream Recording API](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API)
- [AWS presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [AWS lifecycle expiration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html)
