import { readFile, writeFile } from 'node:fs/promises';
// Input JSON avoids ambiguity from commas/quotes in free-text CSV observations.
const path = process.argv[2]; if (!path) throw Error('Usage: node scripts/evaluate.mjs evaluation/results.json');
const trials = JSON.parse(await readFile(path, 'utf8'));
const groups = new Map();
for (const trial of trials) {
  if (trial.completed !== true) continue;
  if (!['baseline', 'tuned', 'integrated'].includes(trial.round) || typeof trial.scenario !== 'string'
    || typeof trial.expectedTrigger !== 'boolean' || !Number.isFinite(trial.durationSeconds) || trial.durationSeconds <= 0
    || !Number.isInteger(trial.flagCount) || trial.flagCount < 0) throw Error('Invalid completed trial');
  const key = `${trial.round}/${trial.scenario}`;
  const group = groups.get(key) ?? { trials: 0, normalTrials: 0, falsePositiveTrials: 0, falseFlags: 0, normalSeconds: 0, suspiciousTrials: 0, detectedTrials: 0 };
  group.trials++;
  if (!trial.expectedTrigger) { group.normalTrials++; group.falsePositiveTrials += Number(trial.flagCount > 0); group.falseFlags += trial.flagCount; group.normalSeconds += trial.durationSeconds; }
  else { group.suspiciousTrials++; group.detectedTrials += Number(trial.flagCount > 0); }
  groups.set(key, group);
}
const report = [...groups].map(([key, g]) => {
  const n = g.normalTrials, p = n ? g.falsePositiveTrials / n : null, z = 1.96;
  const center = n ? (p + z * z / (2 * n)) / (1 + z * z / n) : null;
  const half = n ? z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n) : null;
  return { group: key, ...g, falsePositiveTrialRate: p,
    falsePositive95PercentWilsonInterval: n ? [center - half, center + half] : null,
    falseFlagsPerHour: g.normalSeconds ? g.falseFlags * 3600 / g.normalSeconds : null,
    detectionTrialRate: g.suspiciousTrials ? g.detectedTrials / g.suspiciousTrials : null };
});
const output = { generatedAt: new Date().toISOString(), completedTrials: report.reduce((s, r) => s + r.trials, 0), results: report,
  note: report.length ? 'Rates describe these trials only. Synthetic tests are not model accuracy measurements.' : 'No completed human trials. False-positive rate is unknown.' };
const out = path.replace(/\.json$/, '') + '-summary.json'; await writeFile(out, JSON.stringify(output, null, 2)); console.log(JSON.stringify(output, null, 2));
