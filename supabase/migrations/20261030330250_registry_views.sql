-- Registries across all pillars, on the CHII tables (WORKBOOKS-AND-FLEXIBLE-FIELDS §5).
-- Views run with the caller's permissions (security invoker), so row security decides what each person sees:
-- MELA admins see everyone, pillar staff see their own pillar, and identity stays with the people allowed to see it.

create view public.v_participant_registry with (security_invoker = true) as
select
  p.chii_id,
  i.full_name,
  i.email::text as email,
  i.student_email::text as student_email,
  c.label as cohort,
  iv.name as intervention,
  iv.pillar::text as pillar,
  p.status as participation_status,
  p.registered_on,
  a.status as application_status,
  (select count(*)::int from public.session_attendance sa
     join public.session_meeting m on m.id = sa.session_id
     where sa.chii_id = p.chii_id and m.cohort_id = c.id) as sessions_attended,
  (select count(*)::int from public.session_meeting m where m.cohort_id = c.id) as sessions_total
from public.participation p
join public.cohort c on c.id = p.cohort_id
join public.interventions iv on iv.id = c.intervention_id
left join public.application a on a.id = p.application_id
left join public.beneficiary_identity i on i.chii_id = p.chii_id;

create view public.v_attendance_registry with (security_invoker = true) as
select
  sa.chii_id,
  i.full_name,
  i.email::text as email,
  c.label as cohort,
  iv.name as intervention,
  iv.pillar::text as pillar,
  m.session_date,
  m.title as session_title,
  sa.checked_in_at,
  sa.method
from public.session_attendance sa
join public.session_meeting m on m.id = sa.session_id
join public.cohort c on c.id = m.cohort_id
join public.interventions iv on iv.id = c.intervention_id
left join public.beneficiary_identity i on i.chii_id = sa.chii_id;

create view public.v_feedback_registry with (security_invoker = true) as
select
  f.chii_id,
  i.full_name,
  i.email::text as email,
  c.label as cohort,
  iv.name as intervention,
  iv.pillar::text as pillar,
  f.submitted_at,
  f.satisfaction,
  f.relevance,
  f.nps,
  f.most_useful,
  f.improve,
  f.answers
from public.cohort_feedback f
join public.cohort c on c.id = f.cohort_id
join public.interventions iv on iv.id = c.intervention_id
left join public.beneficiary_identity i on i.chii_id = f.chii_id;

grant select on public.v_participant_registry, public.v_attendance_registry, public.v_feedback_registry to authenticated;
revoke select on public.v_participant_registry, public.v_attendance_registry, public.v_feedback_registry from anon;
