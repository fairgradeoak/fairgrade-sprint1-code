-- Proposed PostgreSQL/RDS schema. Reconcile with Omar's actual SRS/schema before migration.
-- Student/exam/instructor foreign keys must reference the existing FairGrade tables.
CREATE TABLE proctoring_events (
    event_id uuid PRIMARY KEY,
    exam_id text NOT NULL,
    student_id text NOT NULL,
    reasons text[] NOT NULL CHECK (cardinality(reasons) > 0 AND reasons <@ ARRAY['phone','second_face','identity_mismatch','no_face']::text[]),
    triggered_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    object_key text NOT NULL UNIQUE,
    content_type text NOT NULL,
    size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
    clip_metadata jsonb NOT NULL,
    consent_version text NOT NULL,
    consented_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    clip_deleted boolean NOT NULL DEFAULT false,
    reviewed boolean NOT NULL DEFAULT false,
    instructor_decision text CHECK (instructor_decision IN ('confirmed','dismissed')),
    reviewer_id text,
    reviewed_at timestamptz,
    version integer NOT NULL DEFAULT 0,
    CHECK ((reviewed AND instructor_decision IS NOT NULL AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
       OR (NOT reviewed AND instructor_decision IS NULL AND reviewer_id IS NULL AND reviewed_at IS NULL))
);
CREATE INDEX proctoring_events_exam_time ON proctoring_events(exam_id, triggered_at DESC);
CREATE TABLE proctoring_review_audit (
    audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id uuid NOT NULL REFERENCES proctoring_events(event_id),
    reviewer_id text NOT NULL,
    decision text NOT NULL CHECK (decision IN ('confirmed','dismissed')),
    reviewed_at timestamptz NOT NULL DEFAULT now(),
    event_version integer NOT NULL,
    UNIQUE(event_id, event_version)
);
-- Review UPDATE and audit INSERT must run in one transaction, constrained by version.
-- UPDATE proctoring_events SET reviewed=true, instructor_decision=$1, reviewer_id=$2,
-- reviewed_at=now(), version=version+1 WHERE event_id=$3 AND version=$4 RETURNING *;
-- Zero returned rows => 409; do not silently overwrite a concurrent review.
