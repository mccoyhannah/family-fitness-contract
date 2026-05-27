create or replace function public.rest_plan_conflict_reason(student uuid, target_date date)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  cursor_date date;
  plan_is_training boolean;
  check_status text;
  penalty_status text;
begin
  for cursor_date in
    select target_date - 1
    union all
    select target_date + 1
  loop
    plan_is_training := null;
    check_status := null;
    penalty_status := null;

    select is_training into plan_is_training
    from public.plans
    where user_id = student
      and date = cursor_date
    limit 1;

    if plan_is_training = false then
      return '相邻日期已经是休息日，不能连续休息。';
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
      return '相邻日期已经缺卡，今天只能训练或申请请假，不能记为休息。';
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on function public.rest_plan_conflict_reason(uuid, date) from public, anon, authenticated;

create or replace function public.guard_consecutive_rest_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_reason text;
begin
  if new.is_training = false then
    conflict_reason := public.rest_plan_conflict_reason(new.user_id, new.date);
    if conflict_reason is not null then
      raise exception using
        errcode = '23514',
        message = conflict_reason;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_consecutive_rest_plan() from public, anon, authenticated;

drop trigger if exists guard_consecutive_rest_plan on public.plans;
create trigger guard_consecutive_rest_plan
before insert or update of user_id, date, is_training on public.plans
for each row execute function public.guard_consecutive_rest_plan();

create or replace function public.recalculate_missed_penalties(student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with missed_penalties as (
    select
      p.id,
      c.id::text as check_in_id,
      public.compute_consecutive_misses(p.user_id, p.date) as consecutive_count
    from public.penalties p
    left join public.check_ins c
      on c.user_id = p.user_id
     and c.date = p.date
    where p.user_id = student
      and (
        p.source_type = 'missed_checkin'
        or c.status = 'missed'
      )
  )
  update public.penalties p
  set amount = public.compute_penalty_amount(mp.consecutive_count),
      consecutive_count = mp.consecutive_count,
      source_type = coalesce(p.source_type, 'missed_checkin'),
      source_id = coalesce(p.source_id, mp.check_in_id)
  from missed_penalties mp
  where p.id = mp.id;
end;
$$;

revoke execute on function public.recalculate_missed_penalties(uuid) from public, anon, authenticated;

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
    set amount = excluded.amount,
        consecutive_count = excluded.consecutive_count,
        status = case
          when public.penalties.status in ('paid', 'payment_reported', 'waived') then public.penalties.status
          else 'pending'
        end,
        reason = excluded.reason,
        source_type = coalesce(public.penalties.source_type, excluded.source_type),
        source_id = coalesce(public.penalties.source_id, excluded.source_id);

    perform public.recalculate_missed_penalties(new.user_id);
  end if;

  return new;
end;
$$;

revoke execute on function public.ensure_penalty_for_missed_check_in() from public, anon, authenticated;

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

select public.recalculate_missed_penalties(user_id)
from (
  select distinct user_id
  from public.penalties
  where source_type = 'missed_checkin'
  union
  select distinct user_id
  from public.check_ins
  where status = 'missed'
) affected_students;
