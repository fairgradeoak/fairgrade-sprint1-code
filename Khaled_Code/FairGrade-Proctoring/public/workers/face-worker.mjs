let detector, mesh;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      // Classic worker permits Emscripten's importScripts WASM loader; import the API dynamically.
      const { FilesetResolver, FaceDetector, FaceLandmarker } = await import('/vendor/vision_bundle.mjs');
      const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe-wasm');
      detector = await FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: '/models/face_detector.tflite', delegate: 'CPU' }, runningMode: 'VIDEO', minDetectionConfidence: 0.6 });
      mesh = await FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 3, minFaceDetectionConfidence: 0.6, minFacePresenceConfidence: 0.6, outputFacialTransformationMatrixes: true });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      const started = performance.now();
      try {
        const faces = detector.detectForVideo(data.bitmap, data.time).detections;
        const landmarks = mesh.detectForVideo(data.bitmap, data.time).faceLandmarks;
        self.postMessage({ type: 'result', time: data.time, latencyMs: performance.now() - started,
          boxes: faces.map(f => f.boundingBox), faceCount: faces.length, landmarks });
      } finally { data.bitmap.close(); }
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
