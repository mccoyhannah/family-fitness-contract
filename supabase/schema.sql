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
  display_name text not null default '',
  created_at timestamptz default now(),
  primary key (coach_id, student_id),
  check (coach_id <> student_id)
);

alter table public.coach_members add column if not exists display_name text not null default '';

update public.coach_members cm
set display_name = p.name
from public.profiles p
where cm.student_id = p.id
  and nullif(trim(cm.display_name), '') is null;

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
alter table public.check_ins add column if not exists review_comment text;
alter table public.check_ins add column if not exists reviewed_at timestamptz;
alter table public.check_ins add column if not exists reviewer_id uuid references public.profiles(id) on delete set null;

create table if not exists public.penalties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  amount int not null,
  consecutive_count int not null,
  status text not null check (status in ('pending', 'payment_reported', 'paid', 'waived')),
  reason text default '训练日未打卡',
  created_at timestamptz default now(),
  unique(user_id, date)
);

alter table public.penalties add column if not exists source_type text;
alter table public.penalties add column if not exists source_id text;
alter table public.penalties drop constraint if exists penalties_status_check;
alter table public.penalties add constraint penalties_status_check
check (status in ('pending', 'payment_reported', 'paid', 'waived'));
alter table public.penalties drop constraint if exists penalties_source_type_check;
alter table public.penalties add constraint penalties_source_type_check
check (source_type is null or source_type in ('missed_checkin'));

create unique index if not exists penalties_source_unique_idx
on public.penalties (source_type, source_id)
where source_type is not null and source_id is not null;

create table if not exists public.penalty_settings (
  id boolean primary key default true,
  base_amount int not null default 10 check (base_amount >= 0),
  daily_increment int not null default 10 check (daily_increment >= 0),
  max_amount int not null default 50 check (max_amount >= base_amount),
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check (id)
);

insert into public.penalty_settings (id, base_amount, daily_increment, max_amount)
values (true, 10, 10, 50)
on conflict (id) do nothing;

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
alter table public.penalty_settings enable row level security;
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

create or replace function public.guard_check_in_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.review_comment is not null
       or new.reviewed_at is not null
       or new.reviewer_id is not null then
      raise exception 'review fields cannot be set on insert';
    end if;
    return new;
  end if;

  if new.review_comment is distinct from old.review_comment
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reviewer_id is distinct from old.reviewer_id then
    if not public.is_member_coach(new.user_id) then
      raise exception 'only bound coach can change review fields';
    end if;

    new.reviewer_id := auth.uid();
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists guard_check_in_review_fields on public.check_ins;
create trigger guard_check_in_review_fields
before insert or update on public.check_ins
for each row execute function public.guard_check_in_review_fields();

create or replace function public.compute_penalty_amount(consecutive_days int)
returns int
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  rule record;
  base int := 10;
  increment int := 10;
  cap int := 50;
  days int := greatest(1, consecutive_days);
begin
  select base_amount, daily_increment, max_amount
  into rule
  from public.penalty_settings
  where id = true
  limit 1;

  if found then
    base := rule.base_amount;
    increment := rule.daily_increment;
    cap := rule.max_amount;
  end if;

  return least(base + ((days - 1) * increment), cap);
end;
$$;

revoke execute on function public.compute_penalty_amount(int) from public, anon, authenticated;

create or replace function public.touch_penalty_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.id := true;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke execute on function public.touch_penalty_settings() from public, anon, authenticated;

drop trigger if exists touch_penalty_settings on public.penalty_settings;
create trigger touch_penalty_settings
before update on public.penalty_settings
for each row execute function public.touch_penalty_settings();

create or replace function public.compute_consecutive_misses(student uuid, target_date date)
returns int
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  miss_count int := 1;
  cursor_date date := target_date - 1;
  plan_is_training boolean;
  check_status text;
  penalty_status text;
begin
  for _index in 0..29 loop
    plan_is_training := null;
    check_status := null;
    penalty_status := null;

    select is_training into plan_is_training
    from public.plans
    where user_id = student
      and date = cursor_date
    limit 1;

    if plan_is_training = false then
      exit;
    end if;

    select status into check_status
    from public.check_ins
    where user_id = student
      and date = cursor_date
    limit 1;

    select status into penalty_status
    from public.penalties
    where user_id = student
      and date = cursor_date
    limit 1;

    if check_status = 'missed' or (penalty_status is not null and penalty_status <> 'waived') then
      miss_count := miss_count + 1;
      cursor_date := cursor_date - 1;
    else
      exit;
    end if;
  end loop;

  return miss_count;
end;
$$;

revoke execute on function public.compute_consecutive_misses(uuid, date) from public, anon, authenticated;

create or replace function public.ensure_penalty_for_missed_check_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  miss_count int;
  miss_amount int;
begin
  if new.status = 'missed' and (tg_op = 'INSERT' or old.status is distinct from 'missed') then
    miss_count := public.compute_consecutive_misses(new.user_id, new.date);
    miss_amount := public.compute_penalty_amount(miss_count);

    insert into public.penalties (
      user_id,
      date,
      amount,
      consecutive_count,
      status,
      reason,
      source_type,
      source_id
    )
    values (
      new.user_id,
      new.date,
      miss_amount,
      miss_count,
      'pending',
      case
        when new.plan_id is null then '无计划、未请假且未选择休息'
        else '训练日未打卡'
      end,
      'missed_checkin',
      new.id::text
    )
    on conflict (user_id, date) do update
    set amount = case
          when public.penalties.status in ('paid', 'payment_reported') then public.penalties.amount
          else excluded.amount
        end,
        consecutive_count = case
          when public.penalties.status in ('paid', 'payment_reported') then public.penalties.consecutive_count
          else excluded.consecutive_count
        end,
        status = case
          when public.penalties.status in ('paid', 'payment_reported') then public.penalties.status
          else 'pending'
        end,
        reason = excluded.reason,
        source_type = coalesce(public.penalties.source_type, excluded.source_type),
        source_id = coalesce(public.penalties.source_id, excluded.source_id);
  end if;

  return new;
end;
$$;

revoke execute on function public.ensure_penalty_for_missed_check_in() from public, anon, authenticated;

drop trigger if exists ensure_penalty_for_missed_check_in on public.check_ins;
create trigger ensure_penalty_for_missed_check_in
after insert or update on public.check_ins
for each row execute function public.ensure_penalty_for_missed_check_in();

-- Backfill historical missed check-ins that predate the automatic penalty trigger.
-- This is idempotent: existing same-day penalties are preserved.
insert into public.penalties (
  user_id,
  date,
  amount,
  consecutive_count,
  status,
  reason,
  source_type,
  source_id
)
select
  c.user_id,
  c.date,
  public.compute_penalty_amount(public.compute_consecutive_misses(c.user_id, c.date)),
  public.compute_consecutive_misses(c.user_id, c.date),
  'pending',
  case
    when c.plan_id is null then '无计划、未请假且未选择休息'
    else '训练日未打卡'
  end,
  'missed_checkin',
  c.id::text
from public.check_ins c
left join public.penalties p
  on p.user_id = c.user_id
 and p.date = c.date
where c.status = 'missed'
  and p.id is null
on conflict (user_id, date) do nothing;

drop function if exists public.coach_add_member(text);
create or replace function public.coach_add_member(identifier text, display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text := lower(trim(coalesce(identifier, '')));
  nickname text := trim(coalesce(display_name, ''));
  target_student uuid;
begin
  if not public.is_coach() then
    raise exception 'only coach can add members';
  end if;

  if nickname = '' then
    raise exception 'display name is required';
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

  insert into public.coach_members (coach_id, student_id, display_name)
  values (auth.uid(), target_student, nickname)
  on conflict (coach_id, student_id) do update
  set display_name = excluded.display_name;

  return target_student;
end;
$$;

grant execute on function public.coach_add_member(text, text) to authenticated;

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

drop policy if exists "coach_members_update_own_display_name" on public.coach_members;
create policy "coach_members_update_own_display_name"
on public.coach_members for update
to authenticated
using (
  coach_id = auth.uid()
  and public.is_coach()
)
with check (
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
drop policy if exists "coach_insert_bound_missed_check_ins" on public.check_ins;
drop policy if exists "check_ins_insert_student_or_coach_missed" on public.check_ins;
create policy "check_ins_insert_student_or_coach_missed"
on public.check_ins for insert
to authenticated
with check (
  (
    user_id = auth.uid()
    and status in ('completed', 'missed', 'pending_review')
    and (
      plan_id is null
      or exists (
        select 1 from public.plans
        where id = plan_id and user_id = auth.uid()
      )
    )
  )
  or (
    public.is_member_coach(user_id)
    and status = 'missed'
    and (
      plan_id is null
      or exists (
        select 1 from public.plans
        where id = plan_id and user_id = check_ins.user_id
      )
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

drop policy if exists "students_delete_pending_own_check_ins" on public.check_ins;
create policy "students_delete_pending_own_check_ins"
on public.check_ins for delete
to authenticated
using (
  user_id = auth.uid()
  and status = 'pending_review'
);

drop policy if exists "coach_delete_pending_member_check_ins" on public.check_ins;
create policy "coach_delete_pending_member_check_ins"
on public.check_ins for delete
to authenticated
using (
  public.is_member_coach(user_id)
  and status = 'pending_review'
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

drop policy if exists "penalty_settings_select_authenticated" on public.penalty_settings;
create policy "penalty_settings_select_authenticated"
on public.penalty_settings for select
to authenticated
using (true);

drop policy if exists "penalty_settings_update_coach" on public.penalty_settings;
create policy "penalty_settings_update_coach"
on public.penalty_settings for update
to authenticated
using (public.is_coach() and id = true)
with check (public.is_coach() and id = true);

drop policy if exists "students_insert_own_penalties" on public.penalties;
create policy "students_insert_own_penalties"
on public.penalties for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
  and (source_type is null or source_type = 'missed_checkin')
  and source_id is null
);

drop policy if exists "coach_insert_bound_penalties" on public.penalties;
create policy "coach_insert_bound_penalties"
on public.penalties for insert
to authenticated
with check (
  public.is_member_coach(user_id)
  and status = 'pending'
  and (source_type is null or source_type = 'missed_checkin')
);

drop policy if exists "students_update_own_penalties" on public.penalties;
drop policy if exists "students_mark_own_penalties_paid" on public.penalties;
drop policy if exists "students_report_own_penalties_paid" on public.penalties;
create policy "students_report_own_penalties_paid"
on public.penalties for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and status = 'payment_reported'
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

drop policy if exists "coach_delete_member_evidence" on public.check_in_evidence;
create policy "coach_delete_member_evidence"
on public.check_in_evidence for delete
to authenticated
using (
  public.is_member_coach(user_id)
  and exists (
    select 1 from public.check_ins
    where id = check_in_id
      and user_id = check_in_evidence.user_id
      and status = 'pending_review'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkin-evidence', 'checkin-evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

drop policy if exists "evidence_objects_select_related" on storage.objects;
create policy "evidence_objects_select_related"
on storage.objects for select
to authenticated
using (
  bucket_id = 'checkin-evidence'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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

drop policy if exists "evidence_objects_delete_member_coach" on storage.objects;
create policy "evidence_objects_delete_member_coach"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'checkin-evidence'
  and exists (
    select 1
    from public.check_in_evidence e
    join public.check_ins c on c.id = e.check_in_id
    where e.storage_path = storage.objects.name
      and c.status = 'pending_review'
      and public.is_member_coach(e.user_id)
  )
);

grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
-- member_code is used for coach-member binding and should not be rotated by browser clients.
grant update (name, email) on public.profiles to authenticated;

grant select, delete on public.coach_members to authenticated;
revoke insert on public.coach_members from authenticated;
grant update (display_name) on public.coach_members to authenticated;
grant select, insert, update, delete on public.plans to authenticated;
grant select, insert, update, delete on public.plan_items to authenticated;
-- PostgREST upsert requires table-level insert/update grants; RLS and
-- guard_check_in_review_fields still restrict who can write review fields.
grant select, insert, update, delete on public.check_ins to authenticated;
grant insert (user_id, plan_id, date, status, fatigue, issues, note, leave_reason) on public.check_ins to authenticated;
grant update (plan_id, status, fatigue, issues, note, leave_reason, review_comment, reviewed_at, reviewer_id) on public.check_ins to authenticated;
grant select, insert, delete on public.penalties to authenticated;
revoke update on public.penalties from authenticated;
grant update (status) on public.penalties to authenticated;
grant select on public.penalty_settings to authenticated;
grant update (base_amount, daily_increment, max_amount, updated_at, updated_by) on public.penalty_settings to authenticated;
grant select, insert, delete on public.check_in_evidence to authenticated;

-- After creating Auth users manually, insert profiles like:
-- insert into public.profiles (id, name, role, email) values ('<dad-auth-user-uuid>', '爸爸', 'student', '<dad-email>');
-- insert into public.profiles (id, name, role, email) values ('<your-auth-user-uuid>', '你的名字', 'coach', '<your-email>');
