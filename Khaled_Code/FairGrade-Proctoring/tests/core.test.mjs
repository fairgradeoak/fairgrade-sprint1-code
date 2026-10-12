import test from 'node:test';
import assert from 'node:assert/strict';
import { TriggerEngine, identityMismatch } from '../public/core/triggers.mjs';
import { FrameBuffer, selectWindow } from '../public/core/window.mjs';
import { decodeYolo } from '../public/core/yolo.mjs';
import { ApiClient } from '../public/core/api.mjs';

test('phone trigger requires sustained observations, resets on flicker, and latches', () => {
  const engine = new TriggerEngine();
  assert.equal(engine.observe('phone', true, 0), null);
  assert.equal(engine.observe('phone', false, 1000), null);
  assert.equal(engine.observe('phone', true, 1500), null);
  assert.equal(engine.observe('phone', true, 2500), null);
  assert.equal(engine.observe('phone', true, 3500).reason, 'phone');
  assert.equal(engine.observe('phone', true, 4500), null);
});
test('no-face requires three seconds and unknown inference resets its timer', () => {
  const engine = new TriggerEngine();
  for (let t = 0; t <= 2000; t += 1000) assert.equal(engine.observe('no_face', true, t), null);
  engine.observe('no_face', null, 2500);
  for (let t = 3000; t < 6000; t += 1000) assert.equal(engine.observe('no_face', true, t), null);
  assert.equal(engine.observe('no_face', true, 6000).reason, 'no_face');
});
test('stale or duplicate samples cannot manufacture sustained detection', () => {
  const engine = new TriggerEngine();
  engine.observe('phone', true, 0);
  assert.equal(engine.observe('phone', true, 5000), null);
  assert.equal(engine.observe('phone', true, 5000), null);
  assert.equal(engine.observe('phone', true, 4000), null);
  assert.equal(engine.observe('phone', true, 6000), null);
  assert.ok(engine.observe('phone', true, 7000));
});
test('independent reasons and per-reason cooldown', () => {
  const engine = new TriggerEngine({ phoneMs: 100, secondFaceMs: 100, cooldownMs: 1000 });
  engine.observe('phone', true, 0); engine.observe('second_face', true, 0);
  assert.ok(engine.observe('phone', true, 100)); assert.ok(engine.observe('second_face', true, 100));
  engine.observe('phone', false, 200); engine.observe('phone', true, 300);
  assert.equal(engine.observe('phone', true, 500), null);
  assert.ok(engine.observe('phone', true, 1100));
});
test('identity unknown is not a mismatch, and equality is a match', () => {
  assert.equal(identityMismatch(null, 1), null); assert.equal(identityMismatch(0.9, 2), null);
  assert.equal(identityMismatch(0.55, 1), false); assert.equal(identityMismatch(0.8, 1), true);
});
test('invalid trigger configuration and reasons are rejected', () => {
  assert.throws(() => new TriggerEngine({ noFaceMs: -1 }));
  assert.throws(() => new TriggerEngine().observe('bad', true, 0));
});
const frames = (start, end, step = 100) => Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) => ({ time: start + i * step, blob: new Blob(['frame']) }));
test('rolling selection covers exactly requested pre/post timestamps with explicit tolerance', () => {
  const { metadata } = selectWindow(frames(0, 20000), 10000);
  assert.equal(metadata.requestedStartMs, 2500); assert.equal(metadata.requestedEndMs, 17500);
  assert.equal(metadata.preMs, 7500); assert.equal(metadata.postMs, 7500); assert.equal(metadata.complete, true);
});
test('short pre-roll, missing post-roll and internal gaps are marked partial', () => {
  assert.equal(selectWindow(frames(5000, 18000), 10000).metadata.complete, false);
  assert.equal(selectWindow(frames(0, 14000), 10000).metadata.complete, false);
  assert.equal(selectWindow(frames(0, 20000).filter(f => f.time < 9000 || f.time > 10000), 10000).metadata.complete, false);
  assert.throws(() => selectWindow([], 100));
});
test('rolling buffer enforces memory and time limits and clears', () => {
  const buffer = new FrameBuffer({ maxBytes: 12, keepMs: 200 });
  frames(0, 1000).forEach(f => buffer.push(f));
  assert.ok(buffer.bytes <= 12); assert.ok(buffer.frames.at(-1).time - buffer.frames[0].time <= 200);
  buffer.clear(); assert.equal(buffer.bytes, 0); assert.equal(buffer.frames.length, 0);
});
function output(rows, channelsFirst = true) {
  const data = new Float32Array(rows.length * 84);
  rows.forEach((r, i) => r.forEach((x, j) => { data[channelsFirst ? j * rows.length + i : i * 84 + j] = x; }));
  return { data, shape: channelsFirst ? [1, 84, rows.length] : [1, rows.length, 84] };
}
function row(cls, score, center = [320, 320, 100, 100]) { const r = Array(84).fill(0); r.splice(0, 4, ...center); r[cls + 4] = score; return r; }
test('YOLO decodes both layouts, undoes letterboxing, and keeps COCO phone/person', () => {
  for (const layout of [true, false]) {
    const { data, shape } = output([row(67, 0.9), row(0, 0.8), row(2, 0.99)], layout);
    const boxes = decodeYolo(data, shape, { width: 640, height: 480 });
    assert.equal(boxes.length, 2); assert.equal(boxes[0].label, 'cell phone'); assert.equal(boxes[0].y, 190);
  }
});
test('YOLO NMS is class-aware and unsupported schemas fail clearly', () => {
  const { data, shape } = output([row(0, 0.9), row(0, 0.8), row(67, 0.85)]);
  assert.equal(decodeYolo(data, shape, { width: 640, height: 640 }).length, 2);
  assert.throws(() => decodeYolo(data, [1, 85, 3], { width: 640, height: 640 }));
});
test('upload must succeed before event logging; credentials omitted from S3 PUT', async () => {
  const calls = [];
  const fake = async (url, options) => {
    calls.push({ url, options });
    if (String(url).endsWith('presign')) return Response.json({ uploadUrl: 'https://private.example/clip', objectKey: 'clip', requiredHeaders: { 'Content-Type': 'video/webm' } });
    return Response.json({ saved: true });
  };
  const api = new ApiClient({ mode: 'live', apiBase: '/api', uploadOrigins: ['https://private.example'] }, 'student', fake);
  await api.submit({ eventId: 'event', examId: 'exam' }, new Blob(['video'], { type: 'video/webm' }));
  assert.deepEqual(calls.map(c => c.options.method), ['POST', 'PUT', 'POST']);
  assert.equal(calls[1].options.credentials, 'omit'); assert.equal(calls[2].options.headers['Idempotency-Key'], 'event');
});
test('failed upload never creates an event, unsafe origins rejected', async () => {
  const calls = [];
  const fake = async url => { calls.push(url); return String(url).endsWith('presign') ? Response.json({ uploadUrl: 'https://private.example/clip', objectKey: 'clip', requiredHeaders: {} }) : new Response('', { status: 503 }); };
  const api = new ApiClient({ mode: 'live', apiBase: '/api', uploadOrigins: ['https://private.example'] }, 'student', fake);
  await assert.rejects(api.submit({ eventId: 'e' }, new Blob(['x']))); assert.equal(calls.length, 2);
  api.config.uploadOrigins = []; calls.length = 0;
  await assert.rejects(api.submit({ eventId: 'e' }, new Blob(['x'])), /allowlisted/); assert.equal(calls.length, 1);
});
test('fetch keeps the global receiver required by browser implementations', async () => {
  const api = new ApiClient({ mode: 'demo', apiBase: '/api' }, 'student', function () {
    assert.equal(this, globalThis); return Promise.resolve(Response.json({ events: [] }));
  });
  await api.list('exam');
});
