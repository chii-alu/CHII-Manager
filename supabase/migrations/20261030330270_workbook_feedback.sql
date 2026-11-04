-- Feedback workbook (WORKBOOKS-AND-FLEXIBLE-FIELDS §3): one row per feedback response.
-- Answers come from response_value, pivoted into one column per spec field. Completion status follows the cohort's
-- threshold: Completed at or above it, Partially completed if any session was attended, otherwise Did not complete.
create view public.v_workbook_feedback with (security_invoker = true) as
select
  f.id as feedback_id,
  f.chii_id,
  iv.id as intervention_id,
  iv.name as intervention,
  iv.pillar::text as pillar,
  c.label as cohort,
  i.email::text as email,
  i.full_name as name,
  case
    when coalesce(tot.total, 0) > 0 and coalesce(att.attended, 0)::numeric / tot.total >= c.completion_threshold then 'Completed'
    when coalesce(att.attended, 0) > 0 then 'Partially completed'
    else 'Did not complete'
  end as completion_status,
  f.submitted_at,
  rv.relevance,
  rv.quality,
  rv.utility,
  rv.skills_confidence,
  rv.next_action,
  rv.support_needed,
  coalesce(rv.nps, f.nps::text) as nps,
  rv.most_valuable,
  rv.improvements
from public.cohort_feedback f
join public.cohort c on c.id = f.cohort_id
join public.interventions iv on iv.id = c.intervention_id
left join public.beneficiary_identity i on i.chii_id = f.chii_id
left join lateral (
  select count(*)::int as attended
  from public.session_attendance sa
  join public.session_meeting m on m.id = sa.session_id
  where sa.chii_id = f.chii_id and m.cohort_id = c.id
) att on true
left join lateral (
  select count(*)::int as total from public.session_meeting m where m.cohort_id = c.id
) tot on true
left join lateral (
  select
    max(coalesce(v.value_text, v.value_number::text, v.value_json::text)) filter (where v.field_key = 'relevance') as relevance,
    max(coalesce(v.value_text, v.value_number::text, v.value_json::text)) filter (where v.field_key = 'quality') as quality,
    max(coalesce(v.value_text, v.value_number::text, v.value_json::text)) filter (where v.field_key = 'usefulness') as utility,
    max(coalesce(v.value_text, v.value_number::text, v.value_json::text)) filter (where v.field_key = 'confidence') as skills_confidence,
    max(coalesce(v.value_text, v.value_number::text, v.value_json::text)) filter (where v.field_key = 'next_action') as next_action,
    max(coalesce(v.value_text, v.value_number::text, v.value_json::text)) filter (where v.field_key = 'support_needed') as support_needed,
    max(coalesce(v.value_text, v.value_number::text, v.value_json::text)) filter (where v.field_key = 'nps') as nps,
    max(coalesce(v.value_text, v.value_number::text, v.value_json::text)) filter (where v.field_key = 'most_valuable') as most_valuable,
    max(coalesce(v.value_text, v.value_number::text, v.value_json::text)) filter (where v.field_key = 'improvements') as improvements
  from public.response_value v
  where v.response_type = 'feedback' and v.response_id = f.id
) rv on true;

grant select on public.v_workbook_feedback to authenticated;
revoke select on public.v_workbook_feedback from anon;
