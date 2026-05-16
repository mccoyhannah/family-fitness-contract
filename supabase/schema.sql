-- family-fitness-contract v1.1 schema
-- Run this in Supabase SQL Editor after creating the project and Auth users.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('student', 'coach')),
  email text,
  member_code text default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists member_code text default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

update public.profiles
set member_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where member_code is null;

create unique index if not exists profiles_email_unique_idx
on public.profiles (lower(email))
where email is not null;

create unique index if not exists profiles_member_code_unique_idx
on public.profiles (member_code)
where member_code is not null;

create table if not exists public.coach_members (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (coach_id, student_id),
  check (coach_id <> student_id)
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  title text not null,
  focus text default '',
  deadline text not null default '23:00',
  is_training boolean not null default true,
  source text not null check (source in ('coach', 'student')),
  created_at timestamptz default now(),
  unique(user_id, date)
);

create table if not exists public.plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  name text not null,
  sets text not null default '',
  reps text not null default '',
  note text not null default '',
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  date date not null,
  status text not null check (status in ('completed', 'excused', 'missed', 'pending_review')),
  fatigue int check (fatigue between 1 and 5),
  issues text[] default '{}',
  note text default '',
  leave_reason text,
  created_at timestamptz default now(),
  unique(user_id, date)
);

alter table public.check_ins add column if not exists plan_id uuid references public.plans(id) on delete set null;

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

create table if not exists public.check_in_evidence (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null default '',
  mime_type text not null default '',
  size_bytes int not null default 0,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.coach_members enable row level security;
alter table public.plans enable row level security;
alter table public.plan_items enable row level security;
alter table public.check_ins enable row level security;
alter table public.penalties enable row level security;
alter table public.check_in_evidence enable row level security;

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

create or replace function public.is_member_coach(student uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.coach_members
    where coach_id = auth.uid() and student_id = student
  );
$$;

create or replace function public.can_read_student(student uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select student = auth.uid() or public.is_member_coach(student);
$$;

create or replace function public.can_read_plan(plan_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.plans
    where id = plan_id
      and public.can_read_student(user_id)
  );
$$;

create or replace function public.can_manage_plan(plan_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.plans
    where id = plan_id
      and (
        public.is_member_coach(user_id)
        or (
          user_id = auth.uid()
          and source = 'student'
          and date = current_date
        )
      )
  );
$$;

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role <> old.role then
    raise exception 'profile role cannot be changed from client';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_profile_role_change on public.profiles;
create trigger prevent_profile_role_change
before update on public.profiles
for each row execute function public.prevent_profile_role_change();

create or replace function public.coach_add_member(identifier text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := lower(trim(identifier));
  target_student uuid;
begin
  if not public.is_coach() then
    raise exception 'only coach can add members';
  end if;

  select id into target_student
  from public.profiles
  where role = 'student'
    and (
      lower(coalesce(email, '')) = normalized
      or lower(coalesce(member_code, '')) = normalized
    )
  limit 1;

  if target_student is null then
    raise exception 'member not found';
  end if;

  insert into public.coach_members (coach_id, student_id)
  values (auth.uid(), target_student)
  on conflict do nothing;

  return target_student;
end;
$$;

grant execute on function public.coach_add_member(text) to authenticated;

drop policy if exists "profiles_select_own_or_coach" on public.profiles;
drop policy if exists "profiles_select_own_or_bound_coach" on public.profiles;
create policy "profiles_select_own_or_bound_coach"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.is_member_coach(id)
);

drop policy if exists "students_update_own_profile" on public.profiles;
drop policy if exists "users_update_own_profile_safe_columns" on public.profiles;
create policy "users_update_own_profile_safe_columns"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "coach_members_select_related" on public.coach_members;
create policy "coach_members_select_related"
on public.coach_members for select
to authenticated
using (
  coach_id = auth.uid()
  or student_id = auth.uid()
);

drop policy if exists "coach_members_insert_own" on public.coach_members;
create policy "coach_members_insert_own"
on public.coach_members for insert
to authenticated
with check (
  coach_id = auth.uid()
  and public.is_coach()
);

drop policy if exists "coach_members_delete_own" on public.coach_members;
create policy "coach_members_delete_own"
on public.coach_members for delete
to authenticated
using (
  coach_id = auth.uid()
  and public.is_coach()
);

drop policy if exists "plans_select_related" on public.plans;
create policy "plans_select_related"
on public.plans for select
to authenticated
using (public.can_read_student(user_id));

drop policy if exists "plans_insert_by_owner_or_coach" on public.plans;
create policy "plans_insert_by_owner_or_coach"
on public.plans for insert
to authenticated
with check (
  (
    user_id = auth.uid()
    and source = 'student'
    and date = current_date
    and not exists (
      select 1 from public.plans existing
      where existing.user_id = auth.uid()
        and existing.date = plans.date
        and existing.source = 'coach'
    )
  )
  or (
    source = 'coach'
    and public.is_member_coach(user_id)
  )
);

drop policy if exists "plans_update_by_owner_or_coach" on public.plans;
create policy "plans_update_by_owner_or_coach"
on public.plans for update
to authenticated
using (
  (
    user_id = auth.uid()
    and source = 'student'
    and date = current_date
  )
  or public.is_member_coach(user_id)
)
with check (
  (
    user_id = auth.uid()
    and source = 'student'
    and date = current_date
  )
  or (
    source = 'coach'
    and public.is_member_coach(user_id)
  )
);

drop policy if exists "plans_delete_by_owner_or_coach" on public.plans;
create policy "plans_delete_by_owner_or_coach"
on public.plans for delete
to authenticated
using (
  (
    user_id = auth.uid()
    and source = 'student'
    and date = current_date
  )
  or public.is_member_coach(user_id)
);

drop policy if exists "plan_items_select_related" on public.plan_items;
create policy "plan_items_select_related"
on public.plan_items for select
to authenticated
using (public.can_read_plan(plan_id));

drop policy if exists "plan_items_insert_related" on public.plan_items;
create policy "plan_items_insert_related"
on public.plan_items for insert
to authenticated
with check (public.can_manage_plan(plan_id));

drop policy if exists "plan_items_update_related" on public.plan_items;
create policy "plan_items_update_related"
on public.plan_items for update
to authenticated
using (public.can_manage_plan(plan_id))
with check (public.can_manage_plan(plan_id));

drop policy if exists "plan_items_delete_related" on public.plan_items;
create policy "plan_items_delete_related"
on public.plan_items for delete
to authenticated
using (public.can_manage_plan(plan_id));

drop policy if exists "check_ins_select_own_or_coach" on public.check_ins;
drop policy if exists "check_ins_select_related" on public.check_ins;
create policy "check_ins_select_related"
on public.check_ins for select
to authenticated
using (public.can_read_student(user_id));

drop policy if exists "students_upsert_own_check_ins" on public.check_ins;
drop policy if exists "students_insert_own_check_ins" on public.check_ins;
create policy "students_insert_own_check_ins"
on public.check_ins for insert
to authenticated
with check (
  user_id = auth.uid()
  and status in ('completed', 'missed', 'pending_review')
  and (
    plan_id is null
    or exists (
      select 1 from public.plans
      where id = plan_id and user_id = auth.uid()
    )
  )
);

drop policy if exists "students_update_own_check_ins" on public.check_ins;
create policy "students_update_own_check_ins"
on public.check_ins for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and status in ('completed', 'missed', 'pending_review')
  and (
    plan_id is null
    or exists (
      select 1 from public.plans
      where id = plan_id and user_id = auth.uid()
    )
  )
);

drop policy if exists "coach_update_all_check_ins" on public.check_ins;
drop policy if exists "coach_update_bound_check_ins" on public.check_ins;
create policy "coach_update_bound_check_ins"
on public.check_ins for update
to authenticated
using (public.is_member_coach(user_id))
with check (public.is_member_coach(user_id));

drop policy if exists "penalties_select_own_or_coach" on public.penalties;
drop policy if exists "penalties_select_related" on public.penalties;
create policy "penalties_select_related"
on public.penalties for select
to authenticated
using (public.can_read_student(user_id));

drop policy if exists "students_insert_own_penalties" on public.penalties;
create policy "students_insert_own_penalties"
on public.penalties for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
);

drop policy if exists "students_update_own_penalties" on public.penalties;
drop policy if exists "students_mark_own_penalties_paid" on public.penalties;
create policy "students_mark_own_penalties_paid"
on public.penalties for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and status = 'paid'
);

drop policy if exists "coach_update_all_penalties" on public.penalties;
drop policy if exists "coach_update_bound_penalties" on public.penalties;
create policy "coach_update_bound_penalties"
on public.penalties for update
to authenticated
using (public.is_member_coach(user_id))
with check (public.is_member_coach(user_id));

drop policy if exists "evidence_select_related" on public.check_in_evidence;
create policy "evidence_select_related"
on public.check_in_evidence for select
to authenticated
using (public.can_read_student(user_id));

drop policy if exists "students_insert_own_evidence" on public.check_in_evidence;
create policy "students_insert_own_evidence"
on public.check_in_evidence for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.check_ins
    where id = check_in_id and user_id = auth.uid()
  )
);

drop policy if exists "students_delete_own_evidence" on public.check_in_evidence;
create policy "students_delete_own_evidence"
on public.check_in_evidence for delete
to authenticated
using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkin-evidence', 'checkin-evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists "evidence_objects_select_related" on storage.objects;
create policy "evidence_objects_select_related"
on storage.objects for select
to authenticated
using (
  bucket_id = 'checkin-evidence'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
      and public.is_member_coach(((storage.foldername(name))[1])::uuid)
    )
  )
);

drop policy if exists "evidence_objects_insert_own" on storage.objects;
create policy "evidence_objects_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'checkin-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "evidence_objects_update_own" on storage.objects;
create policy "evidence_objects_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'checkin-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'checkin-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "evidence_objects_delete_own" on storage.objects;
create policy "evidence_objects_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'checkin-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (name, email, member_code) on public.profiles to authenticated;

grant select, delete on public.coach_members to authenticated;
revoke insert on public.coach_members from authenticated;
grant select, insert, update, delete on public.plans to authenticated;
grant select, insert, update, delete on public.plan_items to authenticated;
grant select, insert, update, delete on public.check_ins to authenticated;
grant select, insert, delete on public.penalties to authenticated;
revoke update on public.penalties from authenticated;
grant update (status) on public.penalties to authenticated;
grant select, insert, delete on public.check_in_evidence to authenticated;

-- After creating Auth users manually, insert profiles like:
-- insert into public.profiles (id, name, role, email) values ('<dad-auth-user-uuid>', '爸爸', 'student', '<dad-email>');
-- insert into public.profiles (id, name, role, email) values ('<your-auth-user-uuid>', '你的名字', 'coach', '<your-email>');
