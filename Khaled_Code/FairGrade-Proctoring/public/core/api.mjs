export class ApiClient {
  constructor(config, role = 'student', fetcher = fetch) { this.config = config; this.role = role; this.fetcher = fetcher.bind(globalThis); }
  async request(path, { method = 'GET', body, key } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.config.mode === 'demo') headers['X-Demo-Role'] = this.role;
    if (this.config.csrfToken) headers['X-CSRF-Token'] = this.config.csrfToken;
    if (key) headers['Idempotency-Key'] = key;
    const response = await this.fetcher(`${this.config.apiBase}${path}`, {
      method, headers, credentials: 'same-origin', signal: AbortSignal.timeout(20000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw Error(`API ${method} ${path}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  async submit(event, blob) {
    // The backend owns student identity, enrollment checks, object keys, and idempotency.
    const ticket = await this.request('/clips/presign', { method: 'POST', key: event.eventId,
      body: { eventId: event.eventId, examId: event.examId, contentType: blob.type, sizeBytes: blob.size } });
    const target = new URL(ticket.uploadUrl, globalThis.location?.origin ?? 'http://localhost');
    const local = this.config.mode === 'demo' && target.origin === (globalThis.location?.origin ?? 'http://localhost');
    if (!local && (target.protocol !== 'https:' || !this.config.uploadOrigins.includes(target.origin))) throw Error('Upload destination not allowlisted');
    const uploaded = await this.fetcher(target.href, { method: 'PUT', headers: ticket.requiredHeaders,
      body: blob, credentials: 'omit', signal: AbortSignal.timeout(60000) });
    if (!uploaded.ok) throw Error(`Clip upload failed: HTTP ${uploaded.status}`);
    return this.request('/events', { method: 'POST', key: event.eventId,
      body: { ...event, objectKey: ticket.objectKey, contentType: blob.type, sizeBytes: blob.size } });
  }
  list(examId) { return this.request(`/events?examId=${encodeURIComponent(examId)}`); }
  review(eventId, decision, version) {
    return this.request(`/events/${encodeURIComponent(eventId)}/review`, { method: 'PATCH', body: { decision, version } });
  }
  async playback(eventId) {
    const { url } = await this.request(`/events/${encodeURIComponent(eventId)}/playback`);
    const target = new URL(url, globalThis.location?.origin ?? 'http://localhost');
    const local = this.config.mode === 'demo' && target.origin === (globalThis.location?.origin ?? 'http://localhost');
    if (!local && (target.protocol !== 'https:' || !this.config.playbackOrigins.includes(target.origin))) throw Error('Playback destination not allowlisted');
    return target.href;
  }
}
