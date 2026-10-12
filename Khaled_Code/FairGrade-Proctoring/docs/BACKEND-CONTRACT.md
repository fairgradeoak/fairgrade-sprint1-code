# Proposed contract for Omar — not yet agreed or live-tested

All JSON uses camelCase. SQL storage uses snake_case. All timestamps are ISO 8601 UTC. The routes below are an explicit proposal inferred from Khaled's task list; the real SRS and Omar's implementation were unavailable.

## Transport and identity

Use HTTPS and serve `/api` through the same origin as the application. `ApiClient` uses same-origin credentials. Omar must derive `studentId` from the authenticated session and check current exam enrollment. The student may not choose another student's identity. Instructor listing, playback, and review require instructor authorization for the requested exam. Authentication and authorization are **not** provided by the local demo server.

Use a session-specific CSRF token for modifying requests. The frontend supports `X-CSRF-Token`; populate it through the existing authenticated app rather than committing a static secret. `public/config.json` is only development configuration. Do not store bearer tokens or AWS credentials there.

## Routes

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/clips/presign` | Enrolled student | Reserve an object key and short-lived PUT URL |
| POST | `/api/events` | Same student | Verify uploaded object, persist one event |
| GET | `/api/events?examId=...` | Authorized instructor | Return exam events; add pagination for production scale |
| GET | `/api/events/{eventId}/playback` | Authorized instructor | Return a fresh, short-lived GET URL |
| PATCH | `/api/events/{eventId}/review` | Authorized instructor | Confirm/dismiss with optimistic concurrency |

### 1. Presign

Request header: `Idempotency-Key: <event UUID>`.

```json
{
  "eventId": "7015fe74-50cb-43e2-9a62-4f5d1c40fa6e",
  "examId": "exam-123",
  "contentType": "video/webm;codecs=vp8",
  "sizeBytes": 1456789
}
```

```json
{
  "uploadUrl": "https://YOUR_PRIVATE_BUCKET.s3.REGION.amazonaws.com/SIGNED_PATH",
  "objectKey": "proctoring/exam-123/SERVER_STUDENT_ID/7015fe74-50cb-43e2-9a62-4f5d1c40fa6e.webm",
  "requiredHeaders": { "Content-Type": "video/webm;codecs=vp8" },
  "expiresAt": "2026-10-06T13:05:00Z"
}
```

The server constructs the key. Limit uploads to supported video types and 20 MiB; ensure backend verification actually enforces the size limit. PUT presigning alone is not a POST-policy content-length constraint. Verify size/type/existence using S3 HeadObject before accepting an event; add checksums if the team agrees their request/header shape. Never log signed URLs.

The client PUTs the raw Blob with `requiredHeaders` exactly as returned and no app cookies or auth header. CORS must allow the actual student origin and signed headers. The allowed storage origin must also be listed in `config.uploadOrigins`; arbitrary destinations are rejected.

### 2. Event creation after upload

Request header: `Idempotency-Key: <same event UUID>`.

```json
{
  "eventId": "7015fe74-50cb-43e2-9a62-4f5d1c40fa6e",
  "examId": "exam-123",
  "reasons": ["phone"],
  "triggeredAt": "2026-10-06T13:00:00.000Z",
  "triggerMonotonicMs": 32000,
  "sustainedMs": 2100,
  "objectKey": "proctoring/exam-123/SERVER_STUDENT_ID/7015fe74-50cb-43e2-9a62-4f5d1c40fa6e.webm",
  "contentType": "video/webm;codecs=vp8",
  "sizeBytes": 1456789,
  "synthetic": false,
  "consentVersion": "prototype-2026-10-06",
  "consentedAt": "2026-10-06T12:59:00.000Z",
  "thresholds": { "phoneMs": 2000, "identityDistance": 0.55 },
  "clip": {
    "requestedStartMs": 24500,
    "requestedEndMs": 39500,
    "sourceFirstMs": 24400,
    "sourceLastMs": 39600,
    "preMs": 7500,
    "postMs": 7500,
    "sourceDurationMs": 15000,
    "encodedElapsedMs": 15010,
    "maxGapMs": 103,
    "maxReplayGapMs": 45,
    "complete": true,
    "toleranceMs": 250,
    "encodingToleranceMs": 500,
    "audio": false,
    "width": 640,
    "height": 480,
    "targetFps": 10,
    "encoding": "timestamped-jpeg-buffer-to-mediarecorder"
  }
}
```

Example values are illustrative, not measured results. Persist the returned event with server-derived `studentId`, server `createdAt`, `expiresAt`, initial `version: 0`, `reviewed: false`, and null decision/reviewer/timestamp. Production should reject `synthetic: true`. Treat client timing/observations as untrusted evidence metadata, never authoritative proof.

Allowed reasons: `phone`, `second_face`, `identity_mismatch`, `no_face`. The current frontend emits one reason per event. A later backend can group related flags without dropping their individual timestamps.

Only accept keys reserved for this authenticated student and event. Use a unique event UUID constraint. A retry of an identical event returns the original record. A conflicting body/key must fail, not overwrite another event. If upload succeeds but logging fails, retries request another ticket for the same logical key. Already committed objects should be immutable. Expire orphan uploads independently and verify that policy.

### 3. List and playback

List returns `{ "events": [...] }` containing event fields plus `reviewed`, `instructorDecision`, `reviewedAt`, `reviewerId`, `version`, and `clipDeleted`. Do not expose permanent public S3 URLs. Playback returns `{ "url": "https://...short-lived-signed-url..." }` only after authorization and retention checks. Add storage origin(s) to `config.playbackOrigins`.

### 4. Review

```json
{ "decision": "confirmed", "version": 0 }
```

Accepted decisions are `confirmed` and `dismissed`. Atomically update `reviewed=true`, `instructor_decision`, `reviewer_id`, `reviewed_at`, and increment `version`. Append a review audit row in the same transaction. A version conflict returns 409; the reviewer reloads before changing the decision. Neither decision automatically changes a grade.

### Error semantics

| Code | Meaning |
|---:|---|
| 400 | Invalid payload or unverified upload |
| 401 | Missing/expired login |
| 403 | No exam/role authorization or invalid signed ticket |
| 404 | Unknown event |
| 409 | Idempotency/review conflict |
| 410 | Evidence retention expired |
| 413 | Oversized upload |
| 429 | Rate limited |
| 5xx | Retryable backend failure; preserve failed clip locally in memory |

## S3 retention and deployment

`infra/storage.tf` is a **not-applied template for a new dedicated bucket**. It enables public-access blocking, bucket-owner-enforced ownership, encryption, TLS-only access, CORS, and lifecycle expiration under `proctoring/`. It intentionally requires the team to supply `clip_retention_days`; 30 days is only a local demo value.

S3 expiration is asynchronous. Block playback at the application expiry even if physical deletion is pending. New buckets here are unversioned. If versioning is later enabled, the template expires noncurrent versions after one additional day; it does not promise all historical bytes disappear at the current-object deadline. Reconcile Object Lock, replication, backups, and database retention explicitly. Keep metadata retention separate from clip retention.

Omar must review and apply the template or equivalent rules, record `get-bucket-lifecycle-configuration`, check expiration headers, and verify actual deletion with non-sensitive test objects. Do not run Terraform against an existing bucket without reconciling its existing state/rules. No cloud resources were created or modified in this delivery.

## Integration acceptance

1. Confirm route names, authentication, CSRF, field names, timestamp semantics, and server student identity.
2. Test enrollment and instructor authorization denials across two distinct exams/users.
3. Trigger a non-sensitive clip; verify private S3 object and matching RDS row with the same event UUID.
4. Expire a presigned URL and retry; replay a request; verify exactly one logical event.
5. Simulate upload failure and logging failure separately; confirm no success message before both complete.
6. Verify playback, confirm/dismiss, conflict handling, and audit persistence.
7. Verify actual cloud retention and access denial after expiry.
8. Run the full human evaluation through the real deployment and preserve measured results.
