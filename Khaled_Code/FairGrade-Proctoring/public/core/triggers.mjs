export const REASONS = ['phone', 'second_face', 'identity_mismatch', 'no_face'];
export const DEFAULTS = Object.freeze({ phoneMs: 2000, secondFaceMs: 1500,
  mismatchMs: 3000, noFaceMs: 3000, cooldownMs: 30000, maxSampleGapMs: 1500 });

// Only new observations advance time. Missing/failed inference is unknown, never 'no face'.
export class TriggerEngine {
  constructor(config = {}) {
    this.config = { ...DEFAULTS, ...config };
    for (const key of Object.keys(DEFAULTS)) {
      if (!Number.isFinite(this.config[key]) || this.config[key] < 0) throw Error(`Invalid ${key}`);
    }
    this.reset();
  }
  reset() { this.states = new Map(); }
  observe(reason, active, time) {
    if (!REASONS.includes(reason) || !Number.isFinite(time)) throw Error('Invalid observation');
    const old = this.states.get(reason);
    if (old && time <= old.last) return null;
    const state = old ?? { since: null, last: time, fired: false, lastFire: -Infinity };
    if (old && time - old.last > this.config.maxSampleGapMs) {
      state.since = null; state.fired = false;
    }
    state.last = time;
    if (active !== true) { state.since = null; state.fired = false; }
    else if (state.since === null) state.since = time;
    this.states.set(reason, state);
    const key = { phone: 'phoneMs', second_face: 'secondFaceMs', identity_mismatch: 'mismatchMs', no_face: 'noFaceMs' }[reason];
    if (active === true && !state.fired && time - state.since >= this.config[key]
      && time - state.lastFire >= this.config.cooldownMs) {
      state.fired = true; state.lastFire = time;
      return { reason, observedAtMs: time, sustainedMs: time - state.since };
    }
    return null;
  }
}

export function identityMismatch(distance, faceCount, threshold = 0.55) {
  if (faceCount !== 1 || !Number.isFinite(distance)) return null;
  return distance > threshold;
}
