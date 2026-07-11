-- =============================================================================
-- ProctorAI — Supabase SQL Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================================

-- ── interviews ────────────────────────────────────────────────────────────────
-- One row per interview session created by an HR user.

CREATE TABLE IF NOT EXISTS interviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL,
  job_title      TEXT NOT NULL,
  num_questions  INT  NOT NULL DEFAULT 5,
  status         TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'completed'
                  CHECK (status IN ('pending','completed')),
  share_token    TEXT NOT NULL UNIQUE,             -- random token in the candidate URL
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── interview_results ─────────────────────────────────────────────────────────
-- One row per completed interview, linked to the interview above.

CREATE TABLE IF NOT EXISTS interview_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id   UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  answers_json   TEXT,                             -- JSON array of {question,answer,score,feedback}
  scores_json    TEXT,                             -- JSON array of numeric scores
  flags_json     TEXT,                             -- JSON array of proctoring flag objects
  final_report   TEXT,                             -- AI-generated summary paragraph
  overall_score  NUMERIC(4,2),                     -- e.g. 7.40
  recommendation TEXT CHECK (recommendation IN ('hire','review','reject')),
  video_url      TEXT,                             -- public URL of the recorded webcam video
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If you already ran this schema before adding video support, just run:
-- ALTER TABLE interview_results ADD COLUMN IF NOT EXISTS video_url TEXT;

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- HR users can only read/write their own interviews.

ALTER TABLE interviews       ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_results ENABLE ROW LEVEL SECURITY;

-- HR can select, insert, update their own interviews
CREATE POLICY "HR can manage own interviews"
  ON interviews
  FOR ALL
  USING  (hr_user_id = auth.uid())
  WITH CHECK (hr_user_id = auth.uid());

-- Candidates can read interview metadata via share_token (no auth needed)
CREATE POLICY "Candidates can read interview by token"
  ON interviews
  FOR SELECT
  USING (true);   -- filtered in app code by share_token

-- HR can read results for their own interviews
CREATE POLICY "HR can read own results"
  ON interview_results
  FOR SELECT
  USING (
    interview_id IN (
      SELECT id FROM interviews WHERE hr_user_id = auth.uid()
    )
  );

-- Anyone can insert results (candidate submits, no HR auth available)
CREATE POLICY "Results can be inserted by candidates"
  ON interview_results
  FOR INSERT
  WITH CHECK (true);

-- HR can update results for their own interviews
CREATE POLICY "HR can update own results"
  ON interview_results
  FOR UPDATE
  USING (
    interview_id IN (
      SELECT id FROM interviews WHERE hr_user_id = auth.uid()
    )
  );

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_interviews_hr_user  ON interviews (hr_user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_token    ON interviews (share_token);
CREATE INDEX IF NOT EXISTS idx_results_interview   ON interview_results (interview_id);

-- ── Storage: webcam recordings ──────────────────────────────────────────────
-- Create a bucket called "interview-recordings" for the candidate's webcam
-- video. Easiest way: Supabase Dashboard → Storage → New bucket →
--   name: interview-recordings
--   Public bucket: ON   (so getPublicUrl() links work straight from the report page)
--
-- Or create it with SQL instead:
INSERT INTO storage.buckets (id, name, public)
VALUES ('interview-recordings', 'interview-recordings', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone (the candidate, unauthenticated) can upload their own recording —
-- mirrors the "Results can be inserted by candidates" policy above.
CREATE POLICY "Candidates can upload interview recordings"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'interview-recordings');

-- Public read so the video tag / HR report can load it directly by URL.
CREATE POLICY "Anyone can view interview recordings"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'interview-recordings');

-- ── Done ─────────────────────────────────────────────────────────────────────
-- You can verify the tables were created with:
-- SELECT * FROM interviews LIMIT 5;
-- SELECT * FROM interview_results LIMIT 5;