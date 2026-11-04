-- Answers to flexible fields, one row per answer (WORKBOOKS-AND-FLEXIBLE-FIELDS §4).
-- Exports pivot these rows into columns. Core person fields stay on the CHII person tables.

create table public.response_value (
  id bigint generated always as identity primary key,
  response_type text not null check (response_type in ('application', 'participation', 'feedback')),
  response_id uuid not null,
  chii_id text not null references public.beneficiary (chii_id),
  field_key text not null references public.field (field_key),
  value_text text,
  value_number numeric,
  value_json jsonb,                                 -- multi-select answers
  created_at timestamptz not null default now(),
  unique (response_type, response_id, field_key)
);
create index response_value_field_idx on public.response_value (field_key);
create index response_value_response_idx on public.response_value (response_id);
create index response_value_person_idx on public.response_value (chii_id);

-- Which pillar a response belongs to, so the rows follow the same access rules as the response.
create function public.can_access_response(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'feedback' then exists (select 1 from public.cohort_feedback f where f.id = p_id and public.can_access_cohort(f.cohort_id))
    when 'application' then exists (select 1 from public.application a where a.id = p_id and public.can_access_cohort(a.cohort_id))
    when 'participation' then exists (select 1 from public.participation p where p.id = p_id and public.can_access_cohort(p.cohort_id))
    else false
  end;
$$;

alter table public.response_value enable row level security;
create policy response_value_access on public.response_value for all
  using (public.is_admin() or public.can_access_response(response_type, response_id))
  with check (public.is_admin() or public.can_access_response(response_type, response_id));

revoke execute on function public.can_access_response(text, uuid) from public, anon;
grant execute on function public.can_access_response(text, uuid) to authenticated;
