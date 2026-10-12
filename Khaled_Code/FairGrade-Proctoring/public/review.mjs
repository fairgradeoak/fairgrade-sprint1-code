import { ApiClient } from './core/api.mjs';
const $ = id => document.getElementById(id);
const config = await fetch('/config.json').then(r => r.json());
const api = new ApiClient(config, 'instructor');
if (config.mode !== 'demo') $('environment').textContent = 'Instructor access must be enforced by the authenticated backend.';
const node = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
async function load() {
  $('load').disabled = true; $('review-status').textContent = 'Loading…'; $('events').replaceChildren();
  try {
    const { events } = await api.list($('exam').value.trim());
    $('review-status').textContent = `${events.length} flagged event(s).`;
    for (const event of events) {
      const card = node('article', null, 'event'); card.append(node('h3', event.reasons.join(' · ').replaceAll('_', ' ')));
      card.append(node('p', `${new Date(event.triggeredAt).toLocaleString()} · Student ${event.studentId} · ${event.synthetic ? 'SYNTHETIC TEST' : 'Camera observation'}`, 'small'));
      const clip = event.clip ?? {};
      card.append(node('p', `Evidence: ${clip.complete ? 'full requested window' : 'partial / timing gaps — interpret cautiously'} · before ${((clip.preMs || 0) / 1000).toFixed(1)}s · after ${((clip.postMs || 0) / 1000).toFixed(1)}s`, 'small'));
      const decision = node('p', event.reviewed ? `Decision: ${event.instructorDecision} · ${new Date(event.reviewedAt).toLocaleString()}` : 'Awaiting instructor review'); card.append(decision);
      const message = node('p', '', 'small'); message.setAttribute('role', 'status');
      const controls = node('div', null, 'controls'), play = node('button', event.clipDeleted ? 'Clip retention expired' : 'Load private clip', 'secondary'); play.disabled = Boolean(event.clipDeleted);
      const video = node('video'); video.controls = true; video.preload = 'metadata'; video.hidden = true;
      play.onclick = async () => {
        play.disabled = true;
        try { video.src = await api.playback(event.eventId); video.hidden = false; message.textContent = 'Private playback link loaded; reload if it expires.'; }
        catch (e) { message.textContent = e.message; }
        finally { play.disabled = false; }
      };
      video.onerror = () => { message.textContent = 'Playback failed or expired. Reload the private clip link.'; };
      const confirm = node('button', 'Confirm observation'), dismiss = node('button', 'Dismiss flag', 'secondary');
      for (const [button, value] of [[confirm, 'confirmed'], [dismiss, 'dismissed']]) button.onclick = async () => {
        confirm.disabled = dismiss.disabled = true;
        try { const saved = await api.review(event.eventId, value, event.version); Object.assign(event, saved); decision.textContent = `Decision: ${saved.instructorDecision} · ${new Date(saved.reviewedAt).toLocaleString()}`; message.textContent = 'Review saved.'; }
        catch (e) { message.textContent = `${e.message}. Reload events if another reviewer changed this record.`; }
        finally { confirm.disabled = dismiss.disabled = false; }
      };
      controls.append(play, confirm, dismiss); card.append(video, controls, message); $('events').append(card);
    }
  } catch (e) { $('review-status').textContent = e.message; }
  finally { $('load').disabled = false; }
}
$('load').onclick = load; load();
