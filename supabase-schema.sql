-- ============================================================
-- ArchiPilot — Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── Profiles (extends auth.users) ──────────────────────────
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null default '',
  structure text not null default '',
  structure_type text not null default 'architecte',
  address text default '',
  phone text default '',
  email text default '',
  picture_url text,
  pdf_color text default '#D97B0D',
  pdf_font text default 'helvetica',
  api_key text default '',
  lang text default 'fr',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Projects ───────────────────────────────────────────────
create table public.projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  client text default '',
  contractor text default '',
  description text default '',
  address text default '',
  status_id text default 'sketch',
  progress int default 0,
  bureau text default '',
  start_date text default '',
  end_date text default '',
  next_meeting text default '',
  recurrence text default 'none',
  archived boolean default false,
  plan_image_url text,
  plan_markers jsonb default '[]'::jsonb,
  plan_strokes jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Posts (postes de chantier) ──────────────────────────────
create table public.posts (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects on delete cascade not null,
  post_number text not null,
  label text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ── Remarks (remarques) ────────────────────────────────────
create table public.remarks (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts on delete cascade not null,
  text text not null default '',
  urgent boolean default false,
  status text default 'open',
  recipients jsonb default '[]'::jsonb,
  carried_from int,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ── Photos ─────────────────────────────────────────────────
create table public.photos (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts on delete cascade not null,
  storage_path text not null,
  annotated boolean default false,
  created_at timestamptz default now()
);

-- ── PV History ─────────────────────────────────────────────
create table public.pv_history (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects on delete cascade not null,
  number int not null,
  title text default '',
  date text not null,
  author text default '',
  posts_count int default 0,
  excerpt text default '',
  content text default '',
  status text default 'draft',
  imported boolean default false,
  pdf_storage_path text,
  file_name text,
  created_at timestamptz default now()
);

-- ── Participants ───────────────────────────────────────────
create table public.participants (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects on delete cascade not null,
  role text default '',
  name text not null,
  email text default '',
  phone text default '',
  sort_order int default 0
);

-- ── Actions ────────────────────────────────────────────────
create table public.actions (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects on delete cascade not null,
  text text not null,
  who text default '',
  urgent boolean default false,
  open boolean default true,
  since text default ''
);

-- ── Documents ──────────────────────────────────────────────
create table public.documents (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects on delete cascade not null,
  name text not null,
  category text default 'admin',
  storage_path text not null,
  size int default 0,
  uploaded_at timestamptz default now(),
  versions jsonb default '[]'::jsonb
);

-- ── Lots (planning) ───────────────────────────────────────
create table public.lots (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects on delete cascade not null,
  name text not null,
  start_date text default '',
  end_date text default '',
  progress int default 0,
  sort_order int default 0
);

-- ── Checklists ─────────────────────────────────────────────
create table public.checklists (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references public.projects on delete cascade not null,
  name text not null,
  visit_date text default '',
  items jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ── Row Level Security ─────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.posts enable row level security;
alter table public.remarks enable row level security;
alter table public.photos enable row level security;
alter table public.pv_history enable row level security;
alter table public.participants enable row level security;
alter table public.actions enable row level security;
alter table public.documents enable row level security;
alter table public.lots enable row level security;
alter table public.checklists enable row level security;

-- Profiles: users can only read/update their own
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Projects: users can CRUD their own
create policy "Users can view own projects" on public.projects for select using (auth.uid() = user_id);
create policy "Users can create projects" on public.projects for insert with check (auth.uid() = user_id);
create policy "Users can update own projects" on public.projects for update using (auth.uid() = user_id);
create policy "Users can delete own projects" on public.projects for delete using (auth.uid() = user_id);

-- Posts: through project ownership
create policy "Users can view posts" on public.posts for select using (
  exists (select 1 from public.projects where projects.id = posts.project_id and projects.user_id = auth.uid())
);
create policy "Users can create posts" on public.posts for insert with check (
  exists (select 1 from public.projects where projects.id = posts.project_id and projects.user_id = auth.uid())
);
create policy "Users can update posts" on public.posts for update using (
  exists (select 1 from public.projects where projects.id = posts.project_id and projects.user_id = auth.uid())
);
create policy "Users can delete posts" on public.posts for delete using (
  exists (select 1 from public.projects where projects.id = posts.project_id and projects.user_id = auth.uid())
);

-- Same pattern for all child tables
create policy "Users can view remarks" on public.remarks for select using (
  exists (select 1 from public.posts join public.projects on projects.id = posts.project_id where posts.id = remarks.post_id and projects.user_id = auth.uid())
);
create policy "Users can manage remarks" on public.remarks for all using (
  exists (select 1 from public.posts join public.projects on projects.id = posts.project_id where posts.id = remarks.post_id and projects.user_id = auth.uid())
);

create policy "Users can manage photos" on public.photos for all using (
  exists (select 1 from public.posts join public.projects on projects.id = posts.project_id where posts.id = photos.post_id and projects.user_id = auth.uid())
);

create policy "Users can manage pv_history" on public.pv_history for all using (
  exists (select 1 from public.projects where projects.id = pv_history.project_id and projects.user_id = auth.uid())
);

create policy "Users can manage participants" on public.participants for all using (
  exists (select 1 from public.projects where projects.id = participants.project_id and projects.user_id = auth.uid())
);

create policy "Users can manage actions" on public.actions for all using (
  exists (select 1 from public.projects where projects.id = actions.project_id and projects.user_id = auth.uid())
);

create policy "Users can manage documents" on public.documents for all using (
  exists (select 1 from public.projects where projects.id = documents.project_id and projects.user_id = auth.uid())
);

create policy "Users can manage lots" on public.lots for all using (
  exists (select 1 from public.projects where projects.id = lots.project_id and projects.user_id = auth.uid())
);

create policy "Users can manage checklists" on public.checklists for all using (
  exists (select 1 from public.projects where projects.id = checklists.project_id and projects.user_id = auth.uid())
);

-- ── Storage bucket for files ───────────────────────────────
insert into storage.buckets (id, name, public) values ('project-files', 'project-files', false);

create policy "Users can upload files" on storage.objects for insert with check (
  bucket_id = 'project-files' and auth.role() = 'authenticated'
);
create policy "Users can view own files" on storage.objects for select using (
  bucket_id = 'project-files' and auth.role() = 'authenticated'
);
create policy "Users can delete own files" on storage.objects for delete using (
  bucket_id = 'project-files' and auth.role() = 'authenticated'
);

-- ── Updated_at trigger ─────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.update_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute procedure public.update_updated_at();
