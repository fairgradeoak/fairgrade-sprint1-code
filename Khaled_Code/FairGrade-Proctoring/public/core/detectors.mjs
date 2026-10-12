function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = src;
    script.onload = resolve; script.onerror = () => reject(Error(`Missing ${src}; run npm run setup:models`));
    document.head.append(script);
  });
}

class WorkerDetector {
  constructor(url, type, onResult, onError) {
    this.worker = new Worker(url, { type }); this.busy = false; this.last = -Infinity;
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Model initialization timed out')), 120000);
      this.worker.onerror = e => { clearTimeout(timeout); reject(Error(e.message || 'Worker failed to load')); onError(Error('Detector worker unavailable')); };
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'ready') { clearTimeout(timeout); resolve(); }
        if (data.type === 'error') { clearTimeout(timeout); this.busy = false; const e = Error(data.message); reject(e); onError(e); }
        if (data.type === 'result') { this.busy = false; onResult(data); }
      };
    });
    this.worker.postMessage({ type: 'init' });
  }
  async frame(video, time, interval, confidence) {
    if (this.busy && time - this.last > 15000) throw Error('Detector stopped responding; monitoring cannot continue');
    if (this.busy || time - this.last < interval) return;
    this.busy = true; this.last = time;
    try {
      const bitmap = await createImageBitmap(video);
      this.worker.postMessage({ type: 'frame', bitmap, time, confidence }, [bitmap]);
    } catch (error) { this.busy = false; throw error; }
  }
  stop() { this.worker.terminate(); }
}

export class Detectors {
  constructor(video, config, callbacks) { this.video = video; this.config = config; this.callbacks = callbacks; this.reference = null; this.identityBusy = false; this.lastIdentity = -Infinity; this.active = false; }
  async load() {
    this.active = true;
    this.face = new WorkerDetector('/workers/face-worker.mjs', 'classic', d => this.callbacks.face(d), e => this.callbacks.error(e));
    this.object = new WorkerDetector('/workers/object-worker.js', 'classic', d => this.callbacks.object(d), e => this.callbacks.error(e));
    // Consume initialization failures together immediately.
    await Promise.all([this.face.ready, this.object.ready, this.loadIdentity()]);
  }
  async loadIdentity() {
    if (!window.faceapi) await loadScript('/vendor/face-api.min.js');
    await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri('/models/identity'),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models/identity'), faceapi.nets.faceRecognitionNet.loadFromUri('/models/identity')]);
  }
  async descriptors() {
    return faceapi.detectAllFaces(this.video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.65 }))
      .withFaceLandmarks(true).withFaceDescriptors();
  }
  async enroll() {
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const found = await this.descriptors();
      if (!this.active) throw Error('Enrollment cancelled');
      if (found.length !== 1 || found[0].detection.box.width < 100) throw Error('Enrollment needs one clearly visible face, closer to the camera');
      samples.push(found[0].descriptor);
      await new Promise(r => setTimeout(r, 250));
    }
    if (!this.active) throw Error('Enrollment cancelled');
    this.reference = samples;
  }
  async tick(time) {
    if (!this.active) return;
    await Promise.all([this.face.frame(this.video, time, 180), this.object.frame(this.video, time, 350, this.config.thresholds.objectConfidence)]);
    if (this.reference && !this.identityBusy && time - this.lastIdentity >= 800) {
      this.identityBusy = true; this.lastIdentity = time;
      try {
        const found = await this.descriptors();
        if (!this.active) return;
        const distance = found.length === 1 ? Math.min(...this.reference.map(r => faceapi.euclideanDistance(r, found[0].descriptor))) : null;
        this.callbacks.identity({ time, faceCount: found.length, distance });
      } finally { this.identityBusy = false; }
    }
  }
  stop() { this.active = false; this.face?.stop(); this.object?.stop(); this.reference = null; }
}
