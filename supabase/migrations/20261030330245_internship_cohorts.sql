-- Internship cohorts and host placements, from the HEMP Annual Cohort Calendar (Africa Health Collaborative, ALU).
-- Each cohort places interns with several host organisations, each for a set of months.
-- Each row records the real time it was entered (created_at, updated_at). Dates are not taken from the calendar. Each cohort and placement starts without dates; the real dates are entered as they are confirmed.
-- The calendar's planned months are kept in the notes. Headcounts from the cohort table are kept as notes until they are confirmed.

-- 1. Host organisations.
insert into public.organisation (name, org_type) values
  ('CHII Agents', 'host'), ('SFH', 'host'), ('Mindora Health', 'host'), ('RCR', 'host'), ('MDFC', 'host'),
  ('KASHA', 'host'), ('WAG', 'host'), ('SmartAccess', 'host'), ('VitalStrategies', 'host'),
  ('NHIC', 'host'), ('PIH', 'host'), ('RNCDA', 'host')
on conflict (name) do nothing;

-- 2. A host's placement within one cohort.
create table public.cohort_placement (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohort (id) on delete cascade,
  organisation_id uuid not null references public.organisation (id),
  starts_on date,
  ends_on date,
  notes text,
  created_at timestamptz not null default now(),  -- when the row was entered
  updated_at timestamptz not null default now(),
  unique (cohort_id, organisation_id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

alter table public.cohort_placement enable row level security;
create policy cohort_placement_read on public.cohort_placement for select using (public.is_staff());
create policy cohort_placement_write on public.cohort_placement for all
  using (public.can_access_cohort(cohort_id)) with check (public.can_access_cohort(cohort_id));

-- 3. The three cohorts, with dates taken from the calendar.
do $$
declare
  v_iv uuid;
  c1 uuid;
  c2 uuid;
  c3 uuid;
begin
  select id into v_iv from public.interventions where name = 'Internships' and pillar = 'HEMP';
  if v_iv is null then
    raise exception 'The Internships intervention is missing from the catalogue';
  end if;

  insert into public.cohort (intervention_id, label) values
    (v_iv, 'Cohort 1'),
    (v_iv, 'Cohort 2'),
    (v_iv, 'Cohort 3');
  select id into c1 from public.cohort where intervention_id = v_iv and label = 'Cohort 1';
  select id into c2 from public.cohort where intervention_id = v_iv and label = 'Cohort 2';
  select id into c3 from public.cohort where intervention_id = v_iv and label = 'Cohort 3';

  -- Cohort 1: selection in January; placements January to July.
  insert into public.cohort_placement (cohort_id, organisation_id, starts_on, ends_on, notes)
  select c1, o.id, x.s, x.e, x.n from (values
    ('SFH', null::date, null::date, 'Planned Feb–May. Selection, interviews and pre-internship training in January. Headcount in cohort table: 12.'),
    ('Mindora Health', null::date, null::date, 'Planned Feb–May. Selection in January. Headcount in cohort table: 6.'),
    ('RCR', null::date, null::date, 'Planned Feb–May. Selection in January. Headcount in cohort table: 5.'),
    ('MDFC', null::date, null::date, 'Planned Feb–May. Selection in January. Headcount in cohort table: 2.'),
    ('KASHA', null::date, null::date, 'Planned Jan–Jul. Headcount in cohort table: 5.'),
    ('WAG', null::date, null::date, 'Planned Feb–Jul. Selection in January. Headcount in cohort table: 3.'),
    ('SmartAccess', null::date, null::date, 'Planned Feb–Jul. Selection in January. Headcount to be confirmed.'),
    ('VitalStrategies', null::date, null::date, 'Planned Feb–Jul. Selection in January. Headcount to be confirmed.'),
    ('CHII Agents', null::date, null::date, 'Planned dates to be confirmed. Headcount in cohort table: 5.')
  ) as x(org, s, e, n)
  join public.organisation o on o.name = x.org;

  -- Cohort 2: selection in April; placements May to August.
  insert into public.cohort_placement (cohort_id, organisation_id, starts_on, ends_on, notes)
  select c2, o.id, x.s, x.e, x.n from (values
    ('Mindora Health', null::date, null::date, 'Planned May–Aug. Selection in April.'),
    ('RCR', null::date, null::date, 'Planned May–Aug. Selection in April.'),
    ('MDFC', null::date, null::date, 'Planned May–Aug. Selection in April.')
  ) as x(org, s, e, n)
  join public.organisation o on o.name = x.org;

  -- Cohort 3: placements September to November for the first group, and August to December for the second group.
  insert into public.cohort_placement (cohort_id, organisation_id, starts_on, ends_on, notes)
  select c3, o.id, x.s, x.e, x.n from (values
    ('SFH', null::date, null::date, 'Planned Sep–Nov. Selection in August. Headcount in cohort table: 12.'),
    ('Mindora Health', null::date, null::date, 'Planned Sep–Nov. Selection in August. Headcount in cohort table: 6.'),
    ('RCR', null::date, null::date, 'Planned Sep–Nov. Selection in August. Headcount in cohort table: 5.'),
    ('MDFC', null::date, null::date, 'Planned Sep–Nov. Selection in August. Headcount in cohort table: 2.'),
    ('KASHA', null::date, null::date, 'Planned Aug–Dec. Selection in July. Headcount in cohort table: 5.'),
    ('WAG', null::date, null::date, 'Planned Aug–Dec. Selection in July. Headcount in cohort table: 3.'),
    ('SmartAccess', null::date, null::date, 'Planned Aug–Dec. Selection in July. Headcount to be confirmed.'),
    ('VitalStrategies', null::date, null::date, 'Planned Aug–Dec. Selection in July. Headcount to be confirmed.'),
    ('NHIC', null::date, null::date, 'Listed in the cohort table, not on the calendar. Dates to be confirmed.'),
    ('PIH', null::date, null::date, 'Listed in the cohort table, not on the calendar. Dates to be confirmed.'),
    ('RNCDA', null::date, null::date, 'Listed in the cohort table, not on the calendar. Dates to be confirmed.')
  ) as x(org, s, e, n)
  join public.organisation o on o.name = x.org;
end
$$;
