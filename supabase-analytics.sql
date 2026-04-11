-- ══════════════════════════════════════════════════════════
-- ArchiPilot Analytics — Custom event tracking
-- ══════════════════════════════════════════════════════════

-- Events table
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL,
  properties jsonb DEFAULT '{}',
  device text, -- 'mobile' | 'desktop'
  page text, -- current view/page
  session_id text, -- group events by session
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_ae_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_ae_event ON analytics_events(event);
CREATE INDEX IF NOT EXISTS idx_ae_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ae_user_event ON analytics_events(user_id, event);

-- Enable RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "Users can insert own events" ON analytics_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can read their own events (for potential user-facing stats)
CREATE POLICY "Users can read own events" ON analytics_events
  FOR SELECT USING (auth.uid() = user_id);

-- ── Useful views for admin dashboards ──

-- Daily active users
CREATE OR REPLACE VIEW public.analytics_dau AS
SELECT
  date_trunc('day', created_at) AS day,
  count(DISTINCT user_id) AS active_users,
  count(*) AS total_events
FROM analytics_events
GROUP BY 1
ORDER BY 1 DESC;

-- Event counts by type (last 30 days)
CREATE OR REPLACE VIEW public.analytics_event_counts AS
SELECT
  event,
  count(*) AS count,
  count(DISTINCT user_id) AS unique_users
FROM analytics_events
WHERE created_at > now() - interval '30 days'
GROUP BY event
ORDER BY count DESC;

-- User engagement summary
CREATE OR REPLACE VIEW public.analytics_user_summary AS
SELECT
  user_id,
  count(*) AS total_events,
  count(DISTINCT event) AS unique_events,
  min(created_at) AS first_seen,
  max(created_at) AS last_seen,
  count(DISTINCT date_trunc('day', created_at)) AS active_days
FROM analytics_events
GROUP BY user_id
ORDER BY last_seen DESC;
