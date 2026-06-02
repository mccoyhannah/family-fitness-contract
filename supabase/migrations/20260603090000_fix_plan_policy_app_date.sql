create or replace function public.current_app_date()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Shanghai')::date;
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
          and date = public.current_app_date()
        )
      )
  );
$$;

drop policy if exists "plans_insert_by_owner_or_coach" on public.plans;
create policy "plans_insert_by_owner_or_coach"
on public.plans for insert
to authenticated
with check (
  (
    user_id = auth.uid()
    and source = 'student'
    and date = public.current_app_date()
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
    and date = public.current_app_date()
  )
  or public.is_member_coach(user_id)
)
with check (
  (
    user_id = auth.uid()
    and source = 'student'
    and date = public.current_app_date()
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
    and date = public.current_app_date()
  )
  or public.is_member_coach(user_id)
);
