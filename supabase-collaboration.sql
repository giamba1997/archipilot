-- ============================================================
-- ArchiPilot — Collaboration Tables
-- Run this in Supabase SQL Editor AFTER the main schema
-- ============================================================

-- ── Helper: check project access (owner OR member) ─────────
create or replace function public.has_project_access(p_project_id uuid, p_min_role text default 'reader')
returns boolean as $$
begin
  -- Owner always has full access
  if exists (select 1 from public.projects where id = p_project_id and user_id = auth.uid()) then
    return true;
  end if;
  -- Check via user_data (JSONB model — owner always has access)
  if exists (
    select 1 from public.user_data
    where user_id = auth.uid()
  ) then
    -- Skip — user_data doesn't have project-level access
    null;
  end if;
  -- Check membership
  return exists (
    select 1 from public.project_members
    where project_id = p_project_id
      and user_id = auth.uid()
      and status = 'accepted'
      and case
        when p_min_role = 'reader' then true
        when p_min_role = 'contributor' then role in ('contributor', 'admin')
        when p_min_role = 'admin' then role = 'admin'
        else false
      end
  );
end;
$$ language plpgsql security definer stable;

-- ── Project Members ────────────────────────────────────────
create table if not exists public.project_members (
  id uuid default uuid_generate_v4() primary key,
  project_id text not null,             -- matches JSONB project id (string)
  owner_id uuid references auth.users on delete cascade not null,  -- who owns the project
  user_id uuid references auth.users on delete cascade,            -- null until invitation accepted by existing user
  role text not null default 'reader'
    check (role in ('admin', 'contributor', 'reader')),
  invited_by uuid references auth.users on delete set null,
  invited_email text not null,
  invited_name text default '',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  accepted_at timestamptz
);

alter table public.project_members enable row level security;

create index if not exists idx_pm_owner on public.project_members(owner_id);
create index if not exists idx_pm_user on public.project_members(user_id);
create index if not exists idx_pm_email on public.project_members(invited_email);
create index if not exists idx_pm_project on public.project_members(project_id, owner_id);

-- RLS: owner can manage, invited user can see/accept
create policy "Owner can manage members" on public.project_members
  for all using (owner_id = auth.uid());

create policy "Invited user can see own invitations" on public.project_members
  for select using (
    user_id = auth.uid()
    or invited_email = (select email from auth.users where id = auth.uid())
  );

create policy "Invited user can accept/decline" on public.project_members
  for update using (
    (user_id = auth.uid() or invited_email = (select email from auth.users where id = auth.uid()))
    and status = 'pending'
  );

-- ── Comments (on project remarks) ──────────────────────────
create table if not exists public.comments (
  id uuid default uuid_generate_v4() primary key,
  project_id text not null,
  owner_id uuid references auth.users on delete cascade not null,
  post_id text not null,
  remark_index int not null default 0,
  author_id uuid references auth.users on delete cascade not null,
  author_name text not null default '',
  author_picture text,
  body text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.comments enable row level security;

create index if not exists idx_comments_project on public.comments(project_id, owner_id);
create index if not exists idx_comments_post on public.comments(post_id);

-- RLS: project owner + members can read, contributors+ can write
create policy "Project members can view comments" on public.comments
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = comments.project_id
        and pm.owner_id = comments.owner_id
        and pm.user_id = auth.uid()
        and pm.status = 'accepted'
    )
  );

create policy "Contributors can create comments" on public.comments
  for insert with check (
    author_id = auth.uid()
    and (
      owner_id = auth.uid()
      or exists (
        select 1 from public.project_members pm
        where pm.project_id = comments.project_id
          and pm.owner_id = comments.owner_id
          and pm.user_id = auth.uid()
          and pm.status = 'accepted'
          and pm.role in ('contributor', 'admin')
      )
    )
  );

create policy "Authors can update own comments" on public.comments
  for update using (author_id = auth.uid());

create policy "Authors can delete own comments" on public.comments
  for delete using (author_id = auth.uid() or owner_id = auth.uid());

-- ── Notifications ──────────────────────────────────────────
create table if not exists public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  type text not null,   -- 'invite', 'invite_accepted', 'comment', 'remark_update', 'mention'
  project_id text,
  project_name text,
  actor_id uuid references auth.users on delete set null,
  actor_name text default '',
  data jsonb default '{}'::jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

alter table public.notifications enable row level security;

create index if not exists idx_notif_user on public.notifications(user_id, read, created_at desc);

create policy "Users can view own notifications" on public.notifications
  for select using (user_id = auth.uid());

create policy "Users can update own notifications" on public.notifications
  for update using (user_id = auth.uid());

create policy "Authenticated users can create notifications" on public.notifications
  for insert with check (auth.role() = 'authenticated');

-- ── Auto-match invitations when new user signs up ──────────
create or replace function public.match_pending_invitations()
returns trigger as $$
begin
  update public.project_members
  set user_id = new.id
  where invited_email = new.email
    and user_id is null;
  return new;
end;
$$ language plpgsql security definer;

-- Only create trigger if it doesn't exist
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_user_created_match_invitations') then
    create trigger on_user_created_match_invitations
      after insert on auth.users
      for each row execute procedure public.match_pending_invitations();
  end if;
end $$;

-- ── Grant read access to shared project data ───────────────
-- Members need to read the owner's user_data to see shared projects
create policy "Members can view shared project data" on public.user_data
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.project_members pm
      where pm.owner_id = user_data.user_id
        and pm.user_id = auth.uid()
        and pm.status = 'accepted'
    )
  );

-- Also allow members to read owner profiles (for avatar, name)
create policy "Authenticated users can view profiles" on public.profiles
  for select using (auth.role() = 'authenticated');
