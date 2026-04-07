-- ============================================================
-- ArchiPilot — PV Distribution & Read Tracking
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── PV Reads (tracking pixel) ──────────────────────────────
create table if not exists public.pv_reads (
  id uuid default uuid_generate_v4() primary key,
  pv_id text not null,                    -- matches PV identifier (projectId-pvNumber)
  read_at timestamptz default now(),
  ip text default '',
  user_agent text default '',
  email text default ''                   -- filled if we can match
);

alter table public.pv_reads enable row level security;

create index if not exists idx_pv_reads_pv on public.pv_reads(pv_id, read_at desc);

-- Anyone authenticated can view reads for their projects
create policy "Authenticated users can view pv reads" on public.pv_reads
  for select using (auth.role() = 'authenticated');

-- Edge function inserts via service role, so no INSERT policy needed for regular users
create policy "Service role can insert reads" on public.pv_reads
  for insert with check (true);

-- ── PV Sends (who received the PV) ────────────────────────
create table if not exists public.pv_sends (
  id uuid default uuid_generate_v4() primary key,
  project_id text not null,
  pv_number int not null,
  sent_by uuid references auth.users on delete set null,
  sent_to text[] not null default '{}',   -- array of emails
  sent_at timestamptz default now(),
  resend_id text default ''               -- Resend email ID for tracking
);

alter table public.pv_sends enable row level security;

create index if not exists idx_pv_sends_project on public.pv_sends(project_id, pv_number);

create policy "Users can view own pv sends" on public.pv_sends
  for select using (sent_by = auth.uid());

create policy "Users can insert pv sends" on public.pv_sends
  for insert with check (sent_by = auth.uid());
