import http from 'node:http';
import { readFile, writeFile, mkdir, rename, unlink, readdir, stat } from 'node:fs/promises';
import { resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { REASONS } from '../public/core/triggers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const clipType = value => typeof value === 'string' && /^(video\/webm(;codecs=vp[89])?|video\/mp4)$/.test(value);
const error = (code, message) => Object.assign(Error(message), { code });

async function body(req, limit = 65536) {
  let size = 0; const parts = [];
  for await (const part of req) { size += part.length; if (size > limit) throw error(413, 'Body too large'); parts.push(part); }
  return Buffer.concat(parts);
}
async function json(req) { try { return JSON.parse((await body(req)).toString()); } catch (e) { if (e.code) throw e; throw error(400, 'Invalid JSON'); } }

// Deliberately local-only demonstration server, not an authentication implementation.
export async function createDemoServer({ dataDir = resolve(ROOT, 'data'), retentionDays = 30, now = () => Date.now() } = {}) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) throw Error('retentionDays must be a positive integer');
  await mkdir(resolve(dataDir, 'clips'), { recursive: true });
  const dbPath = resolve(dataDir, 'events.json');
  let events;
  try { events = JSON.parse(await readFile(dbPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; events = []; }
  const tickets = new Map(), playbacks = new Map();
  let writes = Promise.resolve(), mutations = Promise.resolve();
  const save = () => {
    const snapshot = JSON.stringify(events, null, 2);
    writes = writes.then(async () => { await writeFile(`${dbPath}.tmp`, snapshot); await rename(`${dbPath}.tmp`, dbPath); });
    return writes;
  };
  const cleanup = async () => {
    const cutoff = now() - retentionDays * 86400000;
    for (const event of events) if (!event.clipDeleted && Date.parse(event.createdAt) < cutoff) {
      await unlink(resolve(dataDir, 'clips', event.objectKey)).catch(e => { if (e.code !== 'ENOENT') throw e; });
      event.clipDeleted = true;
    }
    for (const [key, ticket] of tickets) if (ticket.expiresAt < now()) {
      if (!events.some(e => e.objectKey === ticket.objectKey)) await unlink(resolve(dataDir, 'clips', ticket.objectKey)).catch(e => { if (e.code !== 'ENOENT') throw e; });
      tickets.delete(key);
    }
    for (const [key, ticket] of playbacks) if (ticket.expiresAt < now()) playbacks.delete(key);
    // Recover cleanup after a restart, when unsigned/unlogged upload tickets no longer exist in RAM.
    for (const entry of await readdir(resolve(dataDir, 'clips'), { withFileTypes: true })) {
      if (!entry.isFile() || events.some(e => e.objectKey === entry.name)) continue;
      if ([...tickets.values()].some(t => t.objectKey === entry.name && t.expiresAt >= now())) continue;
      const path = resolve(dataDir, 'clips', entry.name);
      if ((await stat(path)).mtimeMs < now() - 300000) await unlink(path);
    }
    await save();
  };
  const serialize = fn => {
    const result = mutations.then(fn); mutations = result.catch(() => {}); return result;
  };
  await cleanup();
  const timer = setInterval(() => serialize(cleanup).catch(e => console.error('Retention cleanup failed:', e.message)), 60000); timer.unref();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
    const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      const host = req.headers.host;
      const port = server.address().port;
      if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host)) throw error(403, 'Unrecognized host');
      const origin = `http://${host}`;
      if (req.headers.origin && req.headers.origin !== origin) throw error(403, 'Cross-origin request denied');
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/demo-upload/') || url.pathname.startsWith('/demo-playback/')) {
        return await serialize(async () => {
          const role = req.headers['x-demo-role'];
          const requireRole = expected => { if (role !== expected) throw error(403, 'Wrong demo role'); };
          if (req.method === 'POST' && url.pathname === '/api/clips/presign') {
            requireRole('student'); const input = await json(req);
            if (!validId(input.eventId) || !validId(input.examId) || !clipType(input.contentType) || !Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > 20 * 1024 * 1024) throw error(400, 'Invalid upload request');
            if (req.headers['idempotency-key'] !== input.eventId) throw error(400, 'Idempotency key required');
            const objectKey = `${input.eventId}.clip`;
            const previous = events.find(e => e.eventId === input.eventId);
            if (previous && (previous.examId !== input.examId || previous.sizeBytes !== input.sizeBytes || previous.contentType !== input.contentType || previous.clipDeleted)) throw error(409, 'Event conflicts with prior submission');
            const token = randomUUID();
            tickets.set(token, { ...input, objectKey, expiresAt: now() + 300000, uploaded: false, immutable: Boolean(previous) });
            return send(200, { uploadUrl: `${origin}/demo-upload/${token}`, objectKey, requiredHeaders: { 'Content-Type': input.contentType }, expiresAt: new Date(now() + 300000).toISOString() });
          }
          if (req.method === 'PUT' && url.pathname.startsWith('/demo-upload/')) {
            const ticket = tickets.get(url.pathname.split('/').at(-1));
            if (!ticket || ticket.expiresAt < now()) throw error(403, 'Expired upload ticket');
            if (req.headers['content-type'] !== ticket.contentType) throw error(400, 'Content type mismatch');
            const bytes = await body(req, 20 * 1024 * 1024);
            if (bytes.length !== ticket.sizeBytes) throw error(400, 'Content length mismatch');
            if (!ticket.immutable) {
              const path = resolve(dataDir, 'clips', ticket.objectKey);
              await writeFile(`${path}.tmp`, bytes); await rename(`${path}.tmp`, path);
            }
            ticket.uploaded = true; return send(200, { uploaded: true });
          }
          if (req.method === 'POST' && url.pathname === '/api/events') {
            requireRole('student'); const input = await json(req);
            if (!validId(input.eventId) || !validId(input.examId) || req.headers['idempotency-key'] !== input.eventId) throw error(400, 'Invalid event identity');
            const ticket = [...tickets.values()].find(t => t.eventId === input.eventId && t.objectKey === input.objectKey && t.uploaded && t.expiresAt >= now());
            if (!ticket || ticket.examId !== input.examId || ticket.sizeBytes !== input.sizeBytes || ticket.contentType !== input.contentType) throw error(400, 'Verified upload required');
            if (!Array.isArray(input.reasons) || !input.reasons.length || input.reasons.some(r => !REASONS.includes(r)) || !Number.isFinite(Date.parse(input.triggeredAt))) throw error(400, 'Invalid event fields');
            const existing = events.find(e => e.eventId === input.eventId);
            if (existing) return send(200, existing);
            const event = { ...input, studentId: 'demo-student', createdAt: new Date(now()).toISOString(), reviewed: false, instructorDecision: null, reviewedAt: null, reviewerId: null, version: 0, clipDeleted: false };
            events.push(event); await save(); return send(201, event);
          }
          if (req.method === 'GET' && url.pathname === '/api/events') {
            requireRole('instructor'); const examId = url.searchParams.get('examId');
            if (!validId(examId)) throw error(400, 'Exam required');
            return send(200, { events: events.filter(e => e.examId === examId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
          }
          const match = url.pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)\/(review|playback)$/);
          if (match) {
            requireRole('instructor'); const event = events.find(e => e.eventId === match[1]);
            if (!event) throw error(404, 'Event not found');
            if (match[2] === 'review' && req.method === 'PATCH') {
              const input = await json(req);
              if (!['confirmed', 'dismissed'].includes(input.decision)) throw error(400, 'Invalid decision');
              if (input.version !== event.version) throw error(409, 'Review changed; reload before saving');
              event.instructorDecision = input.decision; event.reviewed = true; event.version++;
              event.reviewedAt = new Date(now()).toISOString(); event.reviewerId = 'demo-instructor';
              await save(); return send(200, event);
            }
            if (match[2] === 'playback' && req.method === 'GET') {
              if (event.clipDeleted || Date.parse(event.createdAt) + retentionDays * 86400000 <= now()) throw error(410, 'Clip retention expired');
              const token = randomUUID(); playbacks.set(token, { eventId: event.eventId, expiresAt: now() + 60000 });
              return send(200, { url: `${origin}/demo-playback/${token}` });
            }
          }
          if (req.method === 'GET' && url.pathname.startsWith('/demo-playback/')) {
            const ticket = playbacks.get(url.pathname.split('/').at(-1));
            if (!ticket || ticket.expiresAt < now()) throw error(403, 'Playback ticket expired');
            const event = events.find(e => e.eventId === ticket.eventId);
            if (!event || event.clipDeleted || Date.parse(event.createdAt) + retentionDays * 86400000 <= now()) throw error(410, 'Clip expired');
            const bytes = await readFile(resolve(dataDir, 'clips', event.objectKey));
            res.writeHead(200, { 'Content-Type': event.contentType, 'Content-Length': bytes.length }); return res.end(bytes);
          }
          throw error(404, 'Route not found');
        });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw error(405, 'Method not allowed');
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const publicRoot = resolve(ROOT, 'public'); const path = resolve(publicRoot, `.${relative}`);
      if (!path.startsWith(publicRoot + sep)) throw error(403, 'Forbidden path');
      let bytes = await readFile(path);
      if (path === resolve(publicRoot, 'config.json')) {
        const config = JSON.parse(bytes.toString());
        if (config.mode === 'demo') config.retentionDays = retentionDays;
        bytes = Buffer.from(JSON.stringify(config));
      }
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) {
      if (!res.headersSent) send(e.code === 'ENOENT' ? 404 : Number.isInteger(e.code) ? e.code : 500, { error: Number.isInteger(e.code) ? e.message : 'Request failed' });
      else res.end();
    }
  });
  server.on('close', () => clearInterval(timer));
  return { server, cleanup: () => serialize(cleanup) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = await createDemoServer({ retentionDays: Number(process.env.DEMO_RETENTION_DAYS || 30) });
  server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`FairGrade LOCAL DEMO: http://localhost:${server.address().port}\nThis server is not for production or real exams.`));
}
