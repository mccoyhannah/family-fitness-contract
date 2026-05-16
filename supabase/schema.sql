-- family-fitness-contract v2 schema
-- Run this in Supabase SQL Editor after creating the project and Auth users.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('student', 'coach')),
  created_at timestamptz default now()
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  status text not null check (status in ('completed', 'excused', 'missed', 'pending_review')),
  fatigue int check (fatigue between 1 and 5),
  issues text[] default '{}',
  note text default '',
  leave_reason text,
  created_at timestamptz default now(),
  unique(user_id, date)
);

create table if not exists public.penalties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  amount int not null,
  consecutive_count int not null,
  status text not null check (status in ('pending', 'paid', 'waived')),
  reason text default '训练日未打卡',
  created_at timestamptz default now(),
  unique(user_id, date)
);

alter table public.profiles enable row level security;
alter table public.check_ins enable row level security;
alter table public.penalties enable row level security;

create or replace function public.is_coach()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'coach'
  );
$$;

drop policy if exists "profiles_select_own_or_coach" on public.profiles;
create policy "profiles_select_own_or_coach"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.is_coach()
);

drop policy if exists "students_update_own_profile" on public.profiles;
create policy "students_update_own_profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "check_ins_select_own_or_coach" on public.check_ins;
create policy "check_ins_select_own_or_coach"
on public.check_ins for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_coach()
);

drop policy if exists "students_upsert_own_check_ins" on public.check_ins;
create policy "students_upsert_own_check_ins"
on public.check_ins for insert
to authenticated
with check (
  user_id = auth.uid()
  and status in ('completed', 'missed', 'pending_review')
);

drop policy if exists "students_update_own_check_ins" on public.check_ins;
create policy "students_update_own_check_ins"
on public.check_ins for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and status in ('completed', 'missed', 'pending_review')
);

drop policy if exists "coach_update_all_check_ins" on public.check_ins;
create policy "coach_update_all_check_ins"
on public.check_ins for update
to authenticated
using (
  public.is_coach()
)
with check (
  public.is_coach()
);

drop policy if exists "penalties_select_own_or_coach" on public.penalties;
create policy "penalties_select_own_or_coach"
on public.penalties for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_coach()
);

drop policy if exists "students_insert_own_penalties" on public.penalties;
create policy "students_insert_own_penalties"
on public.penalties for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
);

drop policy if exists "students_update_own_penalties" on public.penalties;
create policy "students_update_own_penalties"
on public.penalties for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and status = 'paid'
);

drop policy if exists "coach_update_all_penalties" on public.penalties;
create policy "coach_update_all_penalties"
on public.penalties for update
to authenticated
using (
  public.is_coach()
)
with check (
  public.is_coach()
);

-- After creating Auth users manually, insert profiles like:
-- insert into public.profiles (id, name, role) values ('<dad-auth-user-uuid>', '老张', 'student');
-- insert into public.profiles (id, name, role) values ('<your-auth-user-uuid>', '你的名字', 'coach');
