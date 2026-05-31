alter table public.penalty_settings
add column if not exists check_in_deadline text not null default '23:00';

alter table public.penalty_settings
drop constraint if exists penalty_settings_check_in_deadline_format;

alter table public.penalty_settings
add constraint penalty_settings_check_in_deadline_format
check (check_in_deadline ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

grant update (check_in_deadline) on public.penalty_settings to authenticated;
