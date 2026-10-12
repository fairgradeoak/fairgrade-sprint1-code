# False-positive and integration evaluation protocol

**No human trials have been run for this delivery. False-positive rate is unknown.** The uncompleted rows in `evaluation/results.json` are templates, not evidence.

## Repeatable study

Use consenting participants identified by aliases. Record browser/version, OS, CPU/GPU, webcam, resolution, approximate lighting, glasses, distance, model hashes, and threshold profile. Keep reference enrollment conditions documented. Avoid retaining reference images beyond the agreed protocol.

Use fixed 60-second trials after warmup. Start a fresh monitoring session per trial so prior cooldown state cannot bias the result. Run at least 10 trials for each normal-behavior scenario initially; a small study only provides preliminary estimates. Use multiple participants and ordinary lighting/glasses variation. Analyze participant differences without inferring protected attributes.

| Scenario | Expected observation | What to inspect |
|---|---|---|
| Normal reading and modest head movement | No suspicious flag | Missed face frames and sustained absence |
| Glasses with moderate glare | No suspicious flag | Reference rejects and face loss |
| Ordinary bright/dim indoor lighting | No suspicious flag | Confidence, latency, usable reference |
| Reading aloud / talking to oneself | No suspicious flag | Mouth movement should not itself trigger |
| Ordinary stationery, calculator, cup | No phone flag | Phone false detections |
| Phone held visibly for >3 seconds | Phone flag | Time to flag; box aligns; playable evidence |
| A second consenting person for >2 seconds | Second-face flag | Recall under partial occlusion |
| Leave camera view for >4 seconds | No-face flag | Detection timestamp and window coverage |
| Consenting different person replaces enrollee | Mismatch where usable face observed | False acceptance / unknown comparison |
| Brief <0.5-second interruption | No sustained flag | Debounce behavior |

Complete baseline trials with unchanged defaults. Tune only on those development trials: one threshold/duration at a time, documenting the reason. Re-run matching conditions and add held-out participants/trials for evaluation. Longer debounce can reduce false flags while missing brief true events; report that tradeoff rather than just the lower false-positive number.

## Metrics

- **False-positive trial rate** = normal trials with at least one false flag / all completed normal trials.
- **False flags per hour** = total false flags in normal trials / total normal trial hours.
- **Detection trial rate** = suspicious trials with at least one correct corresponding flag / all completed suspicious trials. The included summary uses `flagCount`; enter only flags of the expected reason for suspicious trials.
- **Identity false reject rate** = genuine usable comparisons rejected / genuine usable comparisons. **False accept rate** = impostor usable comparisons accepted / impostor usable comparisons. Record these separately; the generic trial file does not automatically collect identity comparisons.
- **Pipeline metrics** = flag-to-clip latency, upload duration, event-log duration, failures/retries, source gaps, encoder timing, peak memory, and browser responsiveness. Record unknown/unavailable inference separately.

Run `node scripts/evaluate.mjs evaluation/results.json`. It ignores uncompleted rows, reports denominators, and computes Wilson 95% intervals for false-positive trial rates. Zero observed errors in a small sample does not prove zero risk. Trials should be independent enough for the interval to be interpretable; repeated observations of one participant may be correlated.

Use rounds `baseline`, `tuned`, and `integrated`. Preserve raw exports and a versioned configuration for every round. Use synthetic mode only for pipeline diagnostics, never as an accuracy trial.

## Clip timing verification

Use an on-camera stopwatch or a generated timecode and a clearly timed event. Confirm approximately 7.5 seconds before and after the trigger, with the explicit source/encoder tolerances in the metadata. Check phone, second-face, mismatch, and no-face events. Test adjacent events, prolonged conditions, several distinct episodes, stop during post-roll, camera disconnect, hidden tab, queue capacity, and low-power/CPU-throttled operation.

The prototype pauses the monitoring session by stopping it when hidden; it does not claim continuous hidden-tab proctoring. There is no pre-consent footage. If the approved SRS requires audio, automatic resumability, durable offline clips, exact 15.000-second container metadata, or instant evidence availability, those require additional implementation and validation.

## Integration round

Repeat the normal and suspicious trials through Omar's real APIs. Record S3 object key and RDS event UUID, ensure clip privacy, review decisions, retries, and deletion. Include two-user authorization tests. Do not mark an upload successful merely because the client started a PUT.

## Reporting table

| Round | Completed normal trials | False-positive trials | FP trial rate + interval | False flags/hour | Detection rate | Backend |
|---|---:|---:|---|---|---|---|
| Baseline | 0 | Not measured | Unknown | Unknown | Unknown | Not tested |
| Tuned | 0 | Not measured | Unknown | Unknown | Unknown | Not tested |
| Integrated | 0 | Not measured | Unknown | Unknown | Unknown | Not tested |
