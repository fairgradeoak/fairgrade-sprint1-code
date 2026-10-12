import { TriggerEngine, identityMismatch } from './core/triggers.mjs';
import { EvidenceRecorder } from './core/recorder.mjs';
import { Detectors } from './core/detectors.mjs';
import { ApiClient } from './core/api.mjs';

const $ = id => document.getElementById(id);
const config = await fetch('/config.json').then(r => { if (!r.ok) throw Error('Configuration unavailable'); return r.json(); });
const api = new ApiClient(config);
const log = [], failed = new Map(); let session = null, sequence = 0, toastTimer;
$('environment').textContent = config.mode === 'demo' ? 'LOCAL DEMONSTRATION · clips stored on this computer · no S3/RDS connection' : 'Live backend configured · deployment and accuracy require independent verification';
$('privacy-detail').textContent = config.mode === 'demo'
  ? `Flagged clips are saved on this computer by the local demo server. The demo deletes clips older than ${config.retentionDays} days while its server is running. Event metadata remains until the demo data directory is removed. No microphone is used.`
  : `Flagged clips are uploaded to the institution's configured private storage for authorized instructor review. Configured clip retention: ${config.retentionDays} days. The team must confirm that this is enforced. No microphone is used.`;

function record(message, details = {}) {
  const entry = { at: new Date().toISOString(), message, ...details }; log.push(entry);
  if (log.length > 3000) log.shift();
  if (log.length === 1) $('activity').replaceChildren();
  const li = document.createElement('li'); li.textContent = `${new Date().toLocaleTimeString()} · ${message}`; $('activity').prepend(li);
  while ($('activity').children.length > 150) $('activity').lastChild.remove();
}
function status(message) { $('status').textContent = message; }
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 7000);
}
function failure(error) { record(error.message, { kind: 'error' }); status(error.message); toast(error.message); }
function safeId(value) { return /^[A-Za-z0-9_-]{1,80}$/.test(value); }

function renderFailed() {
  $('pending').replaceChildren();
  for (const [key, item] of failed) {
    const row = document.createElement('div'); const text = document.createElement('span');
    text.textContent = `${key.slice(0, 8)} · Upload/logging failed. Clip is only held in this page's memory.`;
    const retry = document.createElement('button'); retry.textContent = 'Retry submission';
    retry.onclick = async () => { retry.disabled = true; await submit(item.event, item.blob); };
    const download = document.createElement('button'); download.className = 'secondary'; download.textContent = 'Save clip locally';
    download.onclick = () => downloadBlob(item.blob, `${key}.${item.blob.type.includes('mp4') ? 'mp4' : 'webm'}`);
    row.append(text, retry, download); $('pending').append(row);
  }
}
async function submit(event, blob) {
  try {
    await api.submit(event, blob); failed.delete(event.eventId);
    record(`Evidence saved and event logged: ${event.reasons.join(', ')}`, { eventId: event.eventId, clip: event.clip });
    toast('A clip was saved for instructor review. This is not a misconduct decision.');
  } catch (error) {
    if (failed.size >= 3 && !failed.has(event.eventId)) {
      failure(Error('Retry queue is full. Monitoring stopped; this clip requires immediate local download.'));
      downloadBlob(blob, `${event.eventId}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`); stop();
    } else failed.set(event.eventId, { event, blob });
    failure(error);
  }
  renderFailed();
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function observe(s, reason, active, time) {
  if (session !== s || !s.enrolled || !s.recorder?.ready || document.hidden) return;
  // Late results must not represent current behavior; gaps break sustained conditions.
  if (performance.now() - time > config.thresholds.maxSampleGapMs) { s.engine.observe(reason, null, performance.now()); return; }
  const trigger = s.engine.observe(reason, active, time);
  if (!trigger) return;
  const event = { eventId: crypto.randomUUID(), examId: s.examId, reasons: [reason],
    triggeredAt: new Date(s.wallStart + time - s.monoStart).toISOString(), triggerMonotonicMs: time,
    sustainedMs: trigger.sustainedMs, synthetic: s.synthetic, consentVersion: 'prototype-2026-10-06',
    consentedAt: s.consentedAt, thresholds: config.thresholds };
  try {
    s.recorder.trigger(event); record(`Flag: ${reason}. Capturing the post-trigger window.`, { eventId: event.eventId });
    toast('An observation was flagged. A short clip is being prepared for human review.');
  } catch (e) { failure(e); }
}
function drawOverlay(s) {
  const overlay = $('overlay'), source = s.synthetic ? $('synthetic') : $('video');
  overlay.width = source.videoWidth || source.width || 640; overlay.height = source.videoHeight || source.height || 480;
  const ctx = overlay.getContext('2d'); ctx.lineWidth = 2; ctx.font = '16px Segoe UI';
  const now = performance.now();
  if (s.face && now - s.face.time < 2000) {
    ctx.strokeStyle = '#72e6b4'; ctx.fillStyle = '#72e6b4';
    for (const b of s.face.boxes) ctx.strokeRect(b.originX, b.originY, b.width, b.height);
    for (const face of s.face.landmarks) for (const point of face) { ctx.beginPath(); ctx.arc(point.x * overlay.width, point.y * overlay.height, 1, 0, Math.PI * 2); ctx.fill(); }
  }
  if (s.objects && now - s.objects.time < 2000) for (const b of s.objects.boxes) {
    ctx.strokeStyle = b.classId === 67 ? '#ffcf75' : '#88baff'; ctx.fillStyle = ctx.strokeStyle;
    ctx.strokeRect(b.x, b.y, b.width, b.height); ctx.fillText(`${b.label} ${Math.round(b.score * 100)}%`, b.x, Math.max(18, b.y - 6));
  }
}
function drawSynthetic(s, time) {
  const canvas = $('synthetic'), ctx = canvas.getContext('2d'), scenario = $('scenario').value;
  ctx.fillStyle = '#123b35'; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = '#b8ead0'; ctx.font = 'bold 26px Segoe UI';
  ctx.fillText('SYNTHETIC DEMONSTRATION', 34, 56); ctx.font = '20px Segoe UI'; ctx.fillText(scenario, 34, 96);
  ctx.fillText(`${((time - s.monoStart) / 1000).toFixed(1)} seconds`, 34, 440);
  if (scenario !== 'no_face') { ctx.beginPath(); ctx.arc(320, 230, 65, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(255, 300, 130, 85); }
  if (scenario === 'phone') { ctx.fillStyle = '#e5b753'; ctx.fillRect(430, 245, 50, 88); }
  if (scenario === 'second_face') { ctx.beginPath(); ctx.arc(120, 230, 45, 0, Math.PI * 2); ctx.fill(); }
  for (const reason of ['phone', 'second_face', 'identity_mismatch', 'no_face']) observe(s, reason, reason === scenario, time);
  $('face-signal').textContent = `Synthetic · ${scenario === 'no_face' ? 0 : scenario === 'second_face' ? 2 : 1} face(s)`;
  $('object-signal').textContent = `Synthetic · ${scenario === 'phone' ? 'phone present' : 'no phone'}`;
  $('identity-signal').textContent = `Synthetic · ${scenario === 'identity_mismatch' ? 'mismatch' : 'reference match'}`;
}
async function tick(s) {
  while (session === s) {
    const time = performance.now();
    if (s.synthetic) drawSynthetic(s, time);
    else {
      s.detectors.tick(time).catch(e => { if (session === s) { failure(e); stop(); } });
      drawOverlay(s);
    }
    $('buffer-signal').textContent = s.recorder.ready ? `7.5s pre-roll ready · ${(s.recorder.buffer.bytes / 1048576).toFixed(1)} MB` : 'Filling 7.5-second pre-roll…';
    if (!s.armed && s.enrolled && s.recorder.ready) { s.armed = true; $('state').textContent = 'MONITORING'; status('Monitoring active. Keep this tab visible.'); record('Monitoring armed after reference enrollment and pre-roll warmup.'); }
    await new Promise(r => setTimeout(r, 100));
  }
}
$('agree').onchange = () => { $('start').disabled = !$('agree').checked || Boolean(session); };
$('start').onclick = async () => {
  if (!$('agree').checked || session) return;
  const examId = $('exam').value.trim();
  if (!safeId(examId)) return failure(Error('Exam ID must use 1–80 letters, numbers, underscores, or hyphens'));
  if (config.mode !== 'demo' && !config.retentionPolicyConfirmed) return failure(Error('The team must confirm the live retention policy before enabling real monitoring'));
  const s = { id: ++sequence, examId, synthetic: $('mode').value === 'simulation', engine: new TriggerEngine(config.thresholds),
    monoStart: performance.now(), wallStart: Date.now(), consentedAt: new Date().toISOString(), enrolled: false };
  session = s; $('start').disabled = true; $('stop').disabled = false; $('state').textContent = 'STARTING';
  $('exam').disabled = true; $('mode').disabled = true; $('agree').disabled = true;
  try {
    if (s.synthetic && config.mode !== 'demo') throw Error('Synthetic events are restricted to local demo mode');
    if (!window.isSecureContext || !window.MediaRecorder) throw Error('Use a supported browser on localhost or HTTPS');
    if (!s.synthetic) {
      status('Requesting camera permission…');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } }, audio: false });
      if (session !== s) { stream.getTracks().forEach(t => t.stop()); return; }
      s.stream = stream; $('video').srcObject = stream; await $('video').play();
      for (const track of stream.getVideoTracks()) track.onended = () => { if (session === s) { failure(Error('Camera disconnected; monitoring stopped')); stop(); } };
      status('Loading local detection models…');
      s.detectors = new Detectors($('video'), config, {
        face: d => {
          if (session !== s) return; s.face = d;
          $('face-signal').textContent = `${d.faceCount} face(s) · ${d.landmarks[0]?.length ?? 0} landmarks · ${Math.round(d.latencyMs)}ms`;
          observe(s, 'second_face', d.faceCount > 1, d.time); observe(s, 'no_face', d.faceCount === 0, d.time);
        },
        object: d => {
          if (session !== s) return; s.objects = d;
          $('object-signal').textContent = `${d.boxes.filter(b => b.classId === 0).length} person(s) · ${d.boxes.filter(b => b.classId === 67).length} phone(s) · ${Math.round(d.latencyMs)}ms`;
          observe(s, 'phone', d.boxes.some(b => b.classId === 67), d.time);
        },
        identity: d => {
          if (session !== s) return;
          const mismatch = identityMismatch(d.distance, d.faceCount, config.thresholds.identityDistance);
          $('identity-signal').textContent = mismatch === null ? 'Unavailable (requires one clear face)' : `${mismatch ? 'Changed face' : 'Reference match'} · distance ${d.distance.toFixed(3)}`;
          observe(s, 'identity_mismatch', mismatch, d.time);
        },
        error: e => { if (session === s) { failure(e); stop(); } }
      });
      await s.detectors.load();
      if (session !== s) { s.detectors.stop(); return; }
      $('enroll').disabled = false; status('Capture a clear face reference to arm monitoring.');
    } else { s.enrolled = true; drawSynthetic(s, performance.now()); status('Synthetic signals enabled. Warming the evidence buffer…'); }
    $('placeholder').hidden = true; $('synthetic').hidden = !s.synthetic; $('video').hidden = s.synthetic; $('sim-controls').hidden = !s.synthetic;
    s.recorder = new EvidenceRecorder(s.synthetic ? $('synthetic') : $('video'), submit, failure); s.recorder.start();
    $('state').textContent = s.synthetic ? 'WARMING UP' : 'ENROLL REFERENCE';
    record(`Consent accepted. ${s.synthetic ? 'Synthetic' : 'Camera'} session started.`, { examId }); tick(s);
  } catch (error) { if (session === s) { failure(error); stop(); } }
};
$('enroll').onclick = async () => {
  const s = session; if (!s?.detectors || s.enrolled) return;
  $('enroll').disabled = true; status('Hold your face centered for three reference samples…');
  try { await s.detectors.enroll(); if (session !== s) return; s.enrolled = true; record('Three face reference samples captured in memory.'); status('Reference captured. Waiting for the pre-roll buffer…'); }
  catch (e) { if (session === s) { failure(e); $('enroll').disabled = false; } }
};
function stop() {
  const s = session; if (!s) return;
  session = null; s.detectors?.stop(); s.stream?.getTracks().forEach(t => t.stop());
  const discarded = s.recorder?.stop() ?? 0; $('video').srcObject = null;
  $('overlay').getContext('2d').clearRect(0, 0, $('overlay').width, $('overlay').height);
  $('synthetic').hidden = true; $('video').hidden = false; $('sim-controls').hidden = true;
  $('placeholder').hidden = false; $('enroll').disabled = true; $('stop').disabled = true;
  $('start').disabled = !$('agree').checked; $('agree').disabled = false; $('exam').disabled = false; $('mode').disabled = false;
  $('state').textContent = 'STOPPED'; $('buffer-signal').textContent = 'Cleared';
  $('face-signal').textContent = 'Stopped'; $('object-signal').textContent = 'Stopped'; $('identity-signal').textContent = 'Reference cleared';
  record(`Monitoring stopped; reference and rolling frames cleared. ${discarded} pending/encoding clip(s) cancelled.`);
  status('Monitoring stopped. Already submitted clips and failed submission retries are listed separately.');
}
$('stop').onclick = stop;
document.addEventListener('visibilitychange', () => { if (document.hidden && session) { record('Tab became hidden; stopping to avoid unreliable timing.'); stop(); } });
window.addEventListener('pagehide', stop);
window.addEventListener('beforeunload', e => { if (session || failed.size) { e.preventDefault(); e.returnValue = ''; } });
$('export').onclick = () => downloadBlob(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), configuration: config.thresholds, events: log }, null, 2)], { type: 'application/json' }), 'fairgrade-diagnostics.json');
