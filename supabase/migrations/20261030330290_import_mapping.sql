-- Sheet importer (WORKBOOKS-AND-FLEXIBLE-FIELDS §4). Saved column mappings per intervention, so the next import of the
-- same sheet layout is one click, and a record of each import batch (dry run first, then commit).

create table public.import_mapping (
  intervention_id uuid not null references public.interventions (id) on delete cascade,
  sheet_header text not null,
  target text not null,                       -- a person field key, a field dictionary key, or 'ignore'
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (intervention_id, sheet_header)
);

create table public.import_batch (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions (id),
  kind text not null check (kind in ('participants', 'feedback')),
  status text not null default 'dry_run' check (status in ('dry_run', 'imported', 'failed')),
  file_name text,
  summary jsonb not null default '{}',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.import_mapping enable row level security;
alter table public.import_batch enable row level security;

create policy import_mapping_access on public.import_mapping for all
  using (exists (select 1 from public.interventions i where i.id = intervention_id and public.can_access_pillar(i.pillar)))
  with check (exists (select 1 from public.interventions i where i.id = intervention_id and public.can_access_pillar(i.pillar)));

create policy import_batch_access on public.import_batch for all
  using (exists (select 1 from public.interventions i where i.id = intervention_id and public.can_access_pillar(i.pillar)))
  with check (exists (select 1 from public.interventions i where i.id = intervention_id and public.can_access_pillar(i.pillar)));

-- How many emails in a sheet already belong to a CHII person, and how many are new. Counts only, no names or addresses.
create function public.import_match_counts(p_emails text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_staff() then (
    select jsonb_build_object(
      'matched', count(*) filter (where exists (
        select 1 from public.beneficiary_identity i
        where lower(i.email::text) = e.email or lower(i.student_email::text) = e.email)),
      'new', count(*) filter (where not exists (
        select 1 from public.beneficiary_identity i
        where lower(i.email::text) = e.email or lower(i.student_email::text) = e.email))
    )
    from (select distinct lower(trim(x)) as email from unnest(p_emails) as x where nullif(trim(x), '') is not null) e
  ) else jsonb_build_object('matched', 0, 'new', 0) end;
$$;

revoke execute on function public.import_match_counts(text[]) from public, anon;
grant execute on function public.import_match_counts(text[]) to authenticated;
