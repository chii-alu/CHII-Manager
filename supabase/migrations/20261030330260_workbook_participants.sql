-- Participant workbook (WORKBOOKS-AND-FLEXIBLE-FIELDS §2): one row per person per intervention they joined.
-- Interventions, times supported and the intervention count look across every pillar, as the spec sets.
-- Restricted columns (email, names, student ID, standing) follow the row security of the underlying tables.
create view public.v_workbook_participants with (security_invoker = true) as
with pairs as (
  select distinct p.chii_id, iv.id as intervention_id, iv.name as intervention, iv.pillar
  from public.participation p
  join public.cohort c on c.id = p.cohort_id
  join public.interventions iv on iv.id = c.intervention_id
),
totals as (
  select p.chii_id,
    count(*)::int as times_supported,
    count(distinct c.intervention_id)::int as intervention_count,
    string_agg(distinct iv.name, '; ' order by iv.name) as interventions
  from public.participation p
  join public.cohort c on c.id = p.cohort_id
  join public.interventions iv on iv.id = c.intervention_id
  group by p.chii_id
),
current_type as (
  select distinct on (chii_id) chii_id, type
  from public.beneficiary_type
  where valid_to is null
  order by chii_id, valid_from desc
)
select
  pr.chii_id,
  pr.intervention_id,
  pr.intervention,
  pr.pillar::text as pillar,
  i.email::text as email,
  i.full_name as names,
  coalesce(sp.enrolment_status,
    case ct.type when 'student' then 'Student' when 'alumni' then 'Alumni' when 'other' then 'External' else initcap(ct.type) end
  ) as enrollment_status,
  b.gender_identity,
  sp.year_group,
  sp.academic_programme as primary_academic_program,
  b.nationality,
  ins.name as primary_educational_institution,
  b.residence_country as country_of_residence,
  b.residence_city as city_of_residence,
  i.student_id,
  b.gender,
  ss.financial_status as financial_standing,
  ss.academic_status as academic_standing,
  ss.disciplinary_status as disciplinary_standing,
  b.birth_country as country_of_birth,
  case
    when nullif(trim(b.humanitarian_status), '') is null then null
    when lower(trim(b.humanitarian_status)) in ('none', 'no') then 'No'
    else 'Yes'
  end as has_humanitarian_status,
  b.disability_status,
  t.interventions,
  t.intervention_count,
  t.times_supported
from pairs pr
join totals t on t.chii_id = pr.chii_id
join public.beneficiary b on b.chii_id = pr.chii_id
left join public.beneficiary_identity i on i.chii_id = pr.chii_id
left join public.student_profile sp on sp.chii_id = pr.chii_id
left join public.institution ins on ins.id = sp.institution_id
left join public.student_standing ss on ss.chii_id = pr.chii_id
left join current_type ct on ct.chii_id = pr.chii_id;

grant select on public.v_workbook_participants to authenticated;
revoke select on public.v_workbook_participants from anon;
