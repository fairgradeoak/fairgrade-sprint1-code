export const PRE_MS = 7500;
export const POST_MS = 7500;

export function selectWindow(frames, triggerMs, { preMs = PRE_MS, postMs = POST_MS, toleranceMs = 250 } = {}) {
  const startMs = triggerMs - preMs, endMs = triggerMs + postMs;
  const selected = frames.filter(f => f.time >= startMs - toleranceMs && f.time <= endMs + toleranceMs);
  if (!selected.length) throw Error('No frames available for evidence');
  const firstMs = selected[0].time, lastMs = selected.at(-1).time;
  let maxGapMs = 0;
  for (let i = 1; i < selected.length; i++) maxGapMs = Math.max(maxGapMs, selected[i].time - selected[i - 1].time);
  const complete = firstMs <= startMs + toleranceMs && lastMs >= endMs - toleranceMs && maxGapMs <= toleranceMs * 2;
  return { frames: selected, metadata: { requestedStartMs: startMs, requestedEndMs: endMs,
    sourceFirstMs: firstMs, sourceLastMs: lastMs, maxGapMs, complete,
    preMs: Math.max(0, Math.min(preMs, triggerMs - firstMs)),
    postMs: Math.max(0, Math.min(postMs, lastMs - triggerMs)), toleranceMs } };
}

export class FrameBuffer {
  constructor({ keepMs = 17000, maxBytes = 48 * 1024 * 1024 } = {}) {
    this.keepMs = keepMs; this.maxBytes = maxBytes; this.frames = []; this.bytes = 0;
  }
  push(frame) {
    if (this.frames.length && frame.time <= this.frames.at(-1).time) return;
    this.frames.push(frame); this.bytes += frame.blob.size;
    while (this.frames.length > 1 && (this.bytes > this.maxBytes || frame.time - this.frames[0].time > this.keepMs)) {
      this.bytes -= this.frames.shift().blob.size;
    }
  }
  clear() { this.frames = []; this.bytes = 0; }
}
