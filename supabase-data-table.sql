-- ============================================================
-- ArchiPilot — Simple data sync table
-- Run this in Supabase SQL Editor AFTER the main schema
-- ============================================================

-- Store full project data as JSONB (pragmatic cloud sync)
create table if not exists public.user_data (
  user_id uuid references auth.users on delete cascade primary key,
  projects jsonb default '[]'::jsonb,
  active_id int default 1,
  updated_at timestamptz default now()
);

-- RLS
alter table public.user_data enable row level security;

create policy "Users can view own data" on public.user_data
  for select using (auth.uid() = user_id);

create policy "Users can insert own data" on public.user_data
  for insert with check (auth.uid() = user_id);

create policy "Users can update own data" on public.user_data
  for update using (auth.uid() = user_id);

-- Auto update timestamp
create trigger user_data_updated_at
  before update on public.user_data
  for each row execute procedure public.update_updated_at();
