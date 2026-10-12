import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoServer } from '../server/server.mjs';

test('local pipeline: role checks, upload verification, idempotency, review persistence, retention', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'fairgrade-test-'));
  let time = Date.now(); const app = await createDemoServer({ dataDir, now: () => time, retentionDays: 1 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await (await fetch(origin + '/config.json')).json()).retentionDays, 1);
  const orphan = join(dataDir, 'clips', 'orphan.clip'); await writeFile(orphan, 'orphan');
  await utimes(orphan, new Date(time - 600000), new Date(time - 600000));
  await app.cleanup(); await assert.rejects(readFile(orphan), { code: 'ENOENT' });
  const request = (path, { role = 'student', method = 'GET', body, key, extra = {} } = {}) => fetch(origin + path, { method,
    headers: { 'X-Demo-Role': role, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('/api/events?examId=exam')).status, 403);
  assert.equal((await request('/api/events?examId=exam', { role: 'instructor', extra: { Origin: 'https://evil.example' } })).status, 403);
  const event = { eventId: 'event-1', examId: 'exam', contentType: 'video/webm', sizeBytes: 5, reasons: ['phone'], triggeredAt: new Date(time).toISOString(), synthetic: true };
  assert.equal((await request('/api/events', { method: 'POST', body: event, key: event.eventId })).status, 400);
  const pre = await request('/api/clips/presign', { method: 'POST', body: event, key: event.eventId }); assert.equal(pre.status, 200);
  const ticket = await pre.json();
  assert.equal((await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.requiredHeaders, body: 'bad' })).status, 400);
  assert.equal((await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.requiredHeaders, body: 'video' })).status, 200);
  event.objectKey = ticket.objectKey;
  assert.equal((await request('/api/events', { method: 'POST', body: event, key: event.eventId })).status, 201);
  assert.equal((await request('/api/events', { method: 'POST', body: event, key: event.eventId })).status, 200);
  let listing = await (await request('/api/events?examId=exam', { role: 'instructor' })).json(); assert.equal(listing.events.length, 1);
  assert.equal((await request('/api/events/event-1/review', { method: 'PATCH', body: { decision: 'confirmed', version: 0 } })).status, 403);
  let result = await request('/api/events/event-1/review', { role: 'instructor', method: 'PATCH', body: { decision: 'confirmed', version: 0 } });
  assert.equal(result.status, 200); assert.equal((await result.json()).reviewed, true);
  assert.equal((await request('/api/events/event-1/review', { role: 'instructor', method: 'PATCH', body: { decision: 'dismissed', version: 0 } })).status, 409);
  assert.equal(JSON.parse(await readFile(join(dataDir, 'events.json'), 'utf8'))[0].instructorDecision, 'confirmed');
  const playback = await (await request('/api/events/event-1/playback', { role: 'instructor' })).json();
  assert.equal(await (await fetch(playback.url)).text(), 'video');
  time += 86400001; await app.cleanup();
  assert.equal((await request('/api/events/event-1/playback', { role: 'instructor' })).status, 410);
  listing = await (await request('/api/events?examId=exam', { role: 'instructor' })).json(); assert.equal(listing.events[0].clipDeleted, true);
  await assert.rejects(readFile(join(dataDir, 'clips', ticket.objectKey)), { code: 'ENOENT' });
});
