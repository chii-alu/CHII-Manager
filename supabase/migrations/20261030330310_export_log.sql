-- Every export is recorded (WORKBOOKS-AND-FLEXIBLE-FIELDS §7). Staff write their own entries; only admins read the log.
-- Entries cannot be changed or deleted.
create table public.export_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id),
  export_kind text not null check (export_kind in ('workbook', 'registry', 'table')),
  pillar text,
  detail text not null,
  filters jsonb not null default '{}',
  row_count int not null check (row_count >= 0),
  includes_restricted boolean not null,
  file_name text not null
);

alter table public.export_log enable row level security;

create policy export_log_insert on public.export_log for insert
  with check (user_id = (select auth.uid()) and public.is_staff());
create policy export_log_read on public.export_log for select
  using (public.is_admin());

revoke update, delete on public.export_log from public, anon, authenticated;
grant select, insert on public.export_log to authenticated;
