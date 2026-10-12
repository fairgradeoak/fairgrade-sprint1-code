/* Classic worker keeps TF.js 4 separate from face-api.js's older TF.js runtime. */
let model, decodeYolo;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      importScripts('/vendor/tf.min.js');
      ({ decodeYolo } = await import('../core/yolo.mjs'));
      let webgl = false;
      try { webgl = await tf.setBackend('webgl'); } catch {}
      if (!webgl) await tf.setBackend('cpu');
      await tf.ready();
      model = await tf.loadGraphModel('/models/yolov8n/model.json');
      const shape = model.inputs[0].shape;
      if (shape.length !== 4 || shape[1] !== 640 || shape[2] !== 640 || shape[3] !== 3) throw Error('YOLO model requires NHWC [1,640,640,3] input');
      self.postMessage({ type: 'ready', backend: tf.getBackend() });
    } else if (data.type === 'frame') {
      const started = performance.now(), { bitmap } = data;
      let input, output;
      try {
        const width = bitmap.width, height = bitmap.height, scale = Math.min(640 / width, 640 / height);
        const w = Math.round(width * scale), h = Math.round(height * scale);
        input = tf.tidy(() => {
          const pixels = tf.browser.fromPixels(bitmap);
          const resized = tf.image.resizeBilinear(pixels, [h, w]);
          const top = Math.floor((640 - h) / 2), left = Math.floor((640 - w) / 2);
          return tf.pad(resized, [[top, 640 - h - top], [left, 640 - w - left], [0, 0]], 114).div(255).expandDims(0);
        });
        output = await model.executeAsync(input);
        const tensors = Array.isArray(output) ? output : output.shape ? [output] : Object.values(output);
        if (tensors.length !== 1) throw Error('YOLO model must export exactly one raw detection tensor');
        const boxes = decodeYolo(await tensors[0].data(), tensors[0].shape, { width, height, confidence: data.confidence });
        self.postMessage({ type: 'result', time: data.time, boxes, latencyMs: performance.now() - started });
      } finally { bitmap.close(); if (input) input.dispose(); if (output) tf.dispose(output); }
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
