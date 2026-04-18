-- Rate limiting table for persistent rate limiting across Edge Functions
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 1,
  UNIQUE(user_id, action)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON rate_limits(user_id, action);

-- RLS: only service role should access this table
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup: delete expired entries older than 24h (run via pg_cron or manually)
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', $$DELETE FROM rate_limits WHERE window_start < now() - interval '24 hours'$$);
