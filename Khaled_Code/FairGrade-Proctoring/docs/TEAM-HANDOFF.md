# Team handoff drafts — not sent

## Message to Omar

Hi Omar — I have a proctoring prototype covering consent, webcam/model adapters, sustained triggers, a timestamped evidence buffer, upload/event API calls, and instructor playback and decisions. The local mock API is tested; real S3/RDS integration is still pending. The attached contract proposes `/api/clips/presign`, `/api/events`, and per-event playback/review routes.

Can we compare this with your actual routes, authentication/CSRF setup, student identity derivation, expected fields, upload headers/CORS, idempotency handling, and review versioning? Please also confirm the SRS retention duration and how deletion is enforced. I need a test account/environment and a sample request/response before I can verify real integration. No real false-positive rate has been measured yet.

## Message to Ahmed and Teammate A

Hi — Khaled's proctoring implementation is available as a local prototype. It prepares flags and evidence for instructor review; it does not automatically change grades. Core timing and API logic have automated checks. Live webcam/model validation, human false-positive trials, and Omar's actual S3/RDS integration remain pending. I will share baseline/tuned/integrated measurements with denominators after those trials, rather than estimate accuracy from synthetic tests.

## Agenda for the integration meeting

1. Reconcile the original proposal/SRS with this implementation, including consent, audio, clip duration/tolerance, trusted identity enrollment, and retention.
2. Confirm the frontend repository/framework and decide where these modules belong.
3. Agree the exact API contract and run one authorized upload/event/review round trip.
4. Assign retention deployment/verification to Omar and browser acceptance/evaluation to Khaled.
5. Schedule consenting volunteers and two rounds of threshold testing before the full pipeline round.
6. Agree demo wording that accurately distinguishes synthetic plumbing from measured live performance.

These messages are drafts. No messages were sent to teammates and no claim of completed cloud integration is made.
