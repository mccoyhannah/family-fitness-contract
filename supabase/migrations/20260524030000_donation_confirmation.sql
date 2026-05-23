alter table public.penalties add column if not exists donation_note text;
alter table public.penalties add column if not exists donation_reported_at timestamptz;

create table if not exists public.donation_settings (
  id boolean primary key default true,
  qr_image_url text not null default '',
  payment_hint text not null default '扫码或按约定转账后，在这里确认捐赠时间。管理端核对后，这笔贡献会计入家庭基金。',
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  check (id)
);

insert into public.donation_settings (id, qr_image_url, payment_hint)
values (
  true,
  '',
  '扫码或按约定转账后，在这里确认捐赠时间。管理端核对后，这笔贡献会计入家庭基金。'
)
on conflict (id) do nothing;

alter table public.donation_settings enable row level security;

create or replace function public.touch_donation_settings()
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

revoke execute on function public.touch_donation_settings() from public, anon, authenticated;

drop trigger if exists touch_donation_settings on public.donation_settings;
create trigger touch_donation_settings
before insert or update on public.donation_settings
for each row execute function public.touch_donation_settings();

drop policy if exists "donation_settings_select_authenticated" on public.donation_settings;
create policy "donation_settings_select_authenticated"
on public.donation_settings for select
to authenticated
using (true);

drop policy if exists "donation_settings_insert_coach" on public.donation_settings;
create policy "donation_settings_insert_coach"
on public.donation_settings for insert
to authenticated
with check (public.is_coach() and id = true);

drop policy if exists "donation_settings_update_coach" on public.donation_settings;
create policy "donation_settings_update_coach"
on public.donation_settings for update
to authenticated
using (public.is_coach() and id = true)
with check (public.is_coach() and id = true);

drop policy if exists "students_report_own_penalties_paid" on public.penalties;
create policy "students_report_own_penalties_paid"
on public.penalties for update
to authenticated
using (
  user_id = auth.uid()
  and status = 'pending'
)
with check (
  user_id = auth.uid()
  and status = 'payment_reported'
);

revoke update on public.penalties from authenticated;
grant update (status, donation_note, donation_reported_at) on public.penalties to authenticated;
grant select, insert, update on public.donation_settings to authenticated;
