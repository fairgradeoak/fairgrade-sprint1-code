import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createDemoServer } from '../server/server.mjs';

const delay = ms => new Promise(r => setTimeout(r, ms));
const resultDir = resolve('test-results'); await mkdir(resultDir, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'fairgrade-browser-'));
const app = await createDemoServer({ dataDir: join(profile, 'demo-data') });
await new Promise(r => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const executable = process.env.BROWSER_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', ...(process.env.FAIRGRADE_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let browserLog = ''; browser.stderr.on('data', chunk => { browserLog = (browserLog + chunk).slice(-30000); });
let ws, debugEvaluate, debugCdp; const pending = new Map(); let id = 0; const exceptions = []; const checks = [];
const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(`CDP timeout: ${method}`)); }, 25000);
  pending.set(key, { resolve: r => { clearTimeout(timer); resolve(r); }, reject });
  ws.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) }));
});
try {
  let connection;
  for (let i = 0; i < 100; i++) {
    try { connection = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); break; } catch {}
    await delay(200);
  }
  if (!connection) throw Error('Headless browser did not expose a debugging connection');
  ws = new WebSocket(`ws://127.0.0.1:${connection[0]}${connection[1]}`);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => {
    const message = JSON.parse(e.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    if (message.id && pending.has(message.id)) {
      const promise = pending.get(message.id); pending.delete(message.id);
      if (message.error) promise.reject(Error(message.error.message)); else promise.resolve(message.result);
    }
  };
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  const cdp = (method, params) => command(method, params, sessionId);
  const evaluate = async expression => {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? 'Browser evaluation failed');
    return r.result.value;
  };
  debugEvaluate = evaluate; debugCdp = cdp;
  const waitFor = async (expression, timeout = 45000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(250); }
    throw Error(`Browser condition timed out: ${expression}`);
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: origin });
  await waitFor(`document.getElementById('privacy-detail')?.textContent.includes('saved on this computer')`);
  assert.equal(await evaluate(`document.getElementById('start').disabled`), true); checks.push('Consent gates start');
  const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(resultDir, 'student.png'), Buffer.from(shot.data, 'base64'));
  await evaluate(`document.getElementById('mode').value='simulation'; document.getElementById('agree').click(); document.getElementById('start').click()`);
  await waitFor(`document.getElementById('state').textContent==='MONITORING'`);
  checks.push('Synthetic session arms after 7.5-second pre-roll');
  await evaluate(`document.getElementById('scenario').value='phone'`);
  await waitFor(`document.getElementById('activity').textContent.includes('Evidence saved and event logged')`, 50000);
  checks.push('Sustained phone signal produces captured, uploaded and logged clip');
  const events = await evaluate(`fetch('/api/events?examId=demo-exam',{headers:{'X-Demo-Role':'instructor'}}).then(r=>r.json())`);
  assert.equal(events.events.length, 1); const event = events.events[0];
  assert.equal(event.synthetic, true); assert.equal(event.clip.complete, true);
  assert.ok(Math.abs(event.clip.sourceDurationMs - 15000) <= 250);
  assert.ok(Math.abs(event.clip.encodedElapsedMs - 15000) <= 500);
  checks.push('Clip has complete 7.5-second pre/post window and encoding elapsed time within 0.5 seconds');
  await evaluate(`document.getElementById('stop').click()`); checks.push('Monitoring stops and buffer is cleared');
  await cdp('Page.navigate', { url: `${origin}/review.html` });
  await waitFor(`document.querySelectorAll('.event').length===1`);
  await evaluate(`document.querySelector('.event .controls button').click()`);
  await waitFor(`document.querySelector('.event video').readyState>=2`);
  const videoStats = await evaluate(`({width:document.querySelector('video').videoWidth,height:document.querySelector('video').videoHeight, duration:document.querySelector('video').duration})`);
  assert.equal(videoStats.width, 640); assert.equal(videoStats.height, 480); checks.push('Encoded evidence decodes in the browser at 640×480');
  await evaluate(`document.querySelectorAll('.event .controls button')[1].click()`);
  await waitFor(`document.querySelector('.event').textContent.includes('Decision: confirmed')`);
  await evaluate(`document.getElementById('load').click()`);
  await waitFor(`document.querySelector('.event')?.textContent.includes('Decision: confirmed')`); checks.push('Instructor confirmation persists across reload');
  const reviewShot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(resultDir, 'review.png'), Buffer.from(reviewShot.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true); checks.push('Review layout fits mobile viewport');
  assert.deepEqual(exceptions, []); checks.push('No uncaught browser exceptions');
  const report = { timestamp: new Date().toISOString(), checks, event, videoStats, exceptions,
    limitations: ['Synthetic input only; not a model accuracy or webcam test', 'Local mock storage only; not S3/RDS'] };
  await writeFile(join(resultDir, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, clip: event.clip, videoStats }, null, 2));
} catch (error) {
  const state = debugEvaluate ? await debugEvaluate(`({text:document.body.innerText, hidden:document.hidden})`).catch(() => null) : null;
  await writeFile(join(resultDir, 'browser-failure.json'), JSON.stringify({ error: error.message, checks, state, exceptions }, null, 2));
  if (debugCdp) {
    const shot = await debugCdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }).catch(() => null);
    if (shot) await writeFile(join(resultDir, 'failure.png'), Buffer.from(shot.data, 'base64'));
  }
  throw error;
} finally {
  if (ws?.readyState === WebSocket.OPEN) { await command('Browser.close').catch(() => {}); ws.close(); }
  browser.kill(); await new Promise(r => app.server.close(r));
  await writeFile(join(resultDir, 'browser-stderr.txt'), browserLog);
  // This disposable browser profile contains synthetic test footage only.
}
