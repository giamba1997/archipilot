-- Monthly AI usage tracking for plan limit enforcement (maxAiPerMonth).
-- One row per (user, calendar month). The year_month key is "YYYY-MM" in UTC.
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  count      integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month ON ai_usage(user_id, year_month);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own counter (to display usage in the UI).
DROP POLICY IF EXISTS "ai_usage_self_read" ON ai_usage;
CREATE POLICY "ai_usage_self_read" ON ai_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Writes are done via Edge Functions with service role only (no insert/update policy).
