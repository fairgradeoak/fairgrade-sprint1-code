import { FrameBuffer, selectWindow, PRE_MS, POST_MS } from './window.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export function supportedMime() {
  return ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/mp4'].find(x => MediaRecorder.isTypeSupported(x));
}

// Keep compressed video-only frames in RAM. Encode a NEW complete container per event.
// This deliberately avoids concatenating undecodable middle fragments of a WebM stream.
export class EvidenceRecorder {
  constructor(source, onClip, onError) {
    this.source = source; this.onClip = onClip; this.onError = onError;
    this.buffer = new FrameBuffer(); this.pending = []; this.queue = []; this.running = false;
    this.canvas = document.createElement('canvas'); this.canvas.width = 640; this.canvas.height = 480;
    this.context = this.canvas.getContext('2d'); this.generation = 0;
  }
  start() {
    if (!supportedMime()) throw Error('No supported MediaRecorder video format');
    this.running = true; this.generation++; this.sample(this.generation);
  }
  async sample(generation) {
    while (this.running && generation === this.generation) {
      const start = performance.now();
      try {
        const w = this.source.videoWidth || this.source.width, h = this.source.videoHeight || this.source.height;
        if (w && h) {
          this.canvas.width = 640; this.canvas.height = Math.round(640 * h / w);
          this.context.drawImage(this.source, 0, 0, this.canvas.width, this.canvas.height);
          const time = performance.now();
          const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/jpeg', 0.72));
          if (!this.running || generation !== this.generation) break;
          if (blob) this.buffer.push({ time, blob });
          for (const pending of [...this.pending]) if (time >= pending.triggerMs + POST_MS) {
            this.pending.splice(this.pending.indexOf(pending), 1);
            const selected = selectWindow(this.buffer.frames, pending.triggerMs);
            this.queue.push({ ...pending, ...selected, width: this.canvas.width, height: this.canvas.height });
          }
          this.drain(generation);
        }
      } catch (error) { this.onError(error); }
      await pause(Math.max(0, 100 - (performance.now() - start)));
    }
  }
  get ready() { return this.buffer.frames.length > 0 && performance.now() - this.buffer.frames[0].time >= PRE_MS; }
  trigger(event) {
    if (!this.running) throw Error('Evidence capture is stopped');
    if (this.pending.length + this.queue.length + Number(Boolean(this.encoding)) >= 3) throw Error('Evidence queue is full; event was not captured');
    this.pending.push({ event, triggerMs: event.triggerMonotonicMs });
  }
  async drain(generation) {
    if (this.encoding || !this.queue.length || generation !== this.generation) return;
    this.encoding = true;
    const item = this.queue.shift();
    try {
      const result = await this.encode(item, generation);
      if (generation === this.generation && this.running) {
        await this.onClip({ ...item.event, clip: { ...item.metadata, ...result.metadata,
          width: item.width, height: item.height, audio: false, targetFps: 10 } }, result.blob);
      }
    } catch (error) { if (generation === this.generation) this.onError(error); }
    finally { this.encoding = false; if (generation === this.generation) this.drain(generation); }
  }
  async encode(item, generation) {
    const canvas = document.createElement('canvas'); canvas.width = item.width; canvas.height = item.height;
    const ctx = canvas.getContext('2d');
    const startMs = Math.max(item.metadata.requestedStartMs, item.metadata.sourceFirstMs);
    const endMs = Math.min(item.metadata.requestedEndMs, item.metadata.sourceLastMs);
    const durationMs = endMs - startMs;
    if (durationMs <= 0) throw Error('Evidence window is empty');
    let bitmap = await createImageBitmap(item.frames[0].blob);
    ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const stream = canvas.captureStream(10), chunks = [], mimeType = supportedMime();
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 800000 });
    const done = new Promise((resolve, reject) => {
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = e => reject(e.error ?? Error('MediaRecorder error'));
      recorder.onstop = resolve;
    });
    // Attach rejection handler immediately; a recording error must not be unhandled during replay.
    done.catch(() => {});
    let maxReplayGapMs = 0, index = -1;
    const started = performance.now(); let previous = started;
    recorder.start();
    try {
      while (performance.now() - started < durationMs) {
        if (!this.running || generation !== this.generation) throw Error('Evidence capture cancelled');
        if (document.hidden) throw Error('Evidence encoding interrupted by hidden tab; clip not submitted');
        const now = performance.now(); maxReplayGapMs = Math.max(maxReplayGapMs, now - previous); previous = now;
        const wanted = startMs + now - started;
        let next = Math.max(0, index);
        while (next + 1 < item.frames.length && item.frames[next + 1].time <= wanted) next++;
        if (next !== index) {
          bitmap = await createImageBitmap(item.frames[next].blob);
          ctx.drawImage(bitmap, 0, 0); bitmap.close(); index = next;
        }
        await pause(Math.min(40, Math.max(0, durationMs - (performance.now() - started))));
      }
    } finally {
      if (recorder.state !== 'inactive') recorder.stop();
      await done.finally(() => stream.getTracks().forEach(t => t.stop()));
    }
    const encodedElapsedMs = performance.now() - started;
    if (maxReplayGapMs > 500 || Math.abs(encodedElapsedMs - durationMs) > 500) throw Error('Evidence encoding timing exceeded tolerance; clip not submitted');
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
    if (!blob.size) throw Error('Evidence encoder produced an empty file');
    return { blob, metadata: { sourceDurationMs: durationMs, encodedElapsedMs, maxReplayGapMs,
      encoding: 'timestamped-jpeg-buffer-to-mediarecorder', encodingToleranceMs: 500 } };
  }
  stop() {
    this.running = false; this.generation++;
    const discarded = this.pending.length + this.queue.length + Number(Boolean(this.encoding));
    this.pending = []; this.queue = []; this.buffer.clear(); return discarded;
  }
}
