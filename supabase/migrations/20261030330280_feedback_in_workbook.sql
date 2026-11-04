-- Template feedback is saved as CHII data too (Option B): each answer goes to response_value, keyed to the person's CHII ID.
-- The feedback workbook reads both the CHII feedback and the session feedback from template forms.

-- 1. Answer types for session feedback (intern form, old feedback table) and employer feedback.
alter table public.response_value drop constraint if exists response_value_response_type_check;
alter table public.response_value add constraint response_value_response_type_check
  check (response_type in ('application', 'participation', 'feedback', 'session_feedback', 'employer_feedback'));

-- 2. Row security for those answers: the same pillar rule as the session they belong to.
create or replace function public.can_access_response(p_type text, p_id uuid)
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
    when 'session_feedback' then exists (select 1 from public.feedback fb join public.sessions s on s.id = fb.session_id where fb.id = p_id and public.can_access_pillar(s.pillar))
    when 'employer_feedback' then exists (select 1 from public.employer_feedback ef join public.sessions s on s.id = ef.session_id where ef.id = p_id and public.can_access_pillar(s.pillar))
    else false
  end;
$$;

-- 3. Template feedback submission, now also saving the answers as CHII data.
create or replace function public.submit_template_feedback(p_code text, p_email text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_kind text;
  v_template text;
  v_session uuid;
  v_participant public.participants%rowtype;
  v_id uuid;
  v_type text;
  v_chii text;
  v_key text;
  v_val jsonb;
begin
  select f.status::text, f.kind::text, f.template, f.session_id into v_status, v_kind, v_template, v_session
  from public.forms f
  where f.code = p_code and f.kind in ('feedback', 'employer_feedback');
  if not found then
    raise exception 'Form not found' using errcode = 'P0002';
  end if;
  if v_template is distinct from 'feedback_template' then
    raise exception 'This form does not use a feedback template' using errcode = '22023';
  end if;
  if v_status <> 'open' then
    raise exception 'This form is not accepting responses' using errcode = 'P0001';
  end if;

  select * into v_participant from public.participants where email = lower(trim(coalesce(p_email, '')));
  if v_kind = 'feedback' then
    if not found or not exists (select 1 from public.attendance a where a.session_id = v_session and a.participant_id = v_participant.id) then
      raise exception 'We have no attendance record for this email at this session. Check the email used to register.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.feedback fb where fb.session_id = v_session and fb.participant_id = v_participant.id) then
      raise exception 'Feedback from this participant has already been recorded for this session.' using errcode = '23505';
    end if;
    insert into public.feedback (session_id, participant_id, nps, answers)
    values (v_session, v_participant.id, nullif(p_answers ->> 'nps', '')::int, coalesce(p_answers, '{}'::jsonb))
    returning id into v_id;
    v_type := 'session_feedback';
  else
    if not found or not exists (select 1 from public.entries e where e.session_id = v_session and e.participant_id = v_participant.id) then
      raise exception 'This student is not registered for this session. Check the student email address.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.employer_feedback ef where ef.session_id = v_session and ef.participant_id = v_participant.id) then
      raise exception 'Employer feedback for this student has already been recorded for this session.' using errcode = '23505';
    end if;
    insert into public.employer_feedback (session_id, participant_id, nps, answers)
    values (v_session, v_participant.id, nullif(p_answers ->> 'performance_rating', '')::int, coalesce(p_answers, '{}'::jsonb))
    returning id into v_id;
    v_type := 'employer_feedback';
  end if;

  -- The person's CHII ID (created if they do not have one yet), so the answers are CHII data.
  v_chii := public.resolve_beneficiary(
    coalesce(nullif(trim(v_participant.name), ''), v_participant.email::text),
    v_participant.email::text, null, null, 'student', '{}'::jsonb
  ) ->> 'chii_id';

  for v_key, v_val in select key, value from jsonb_each(coalesce(p_answers, '{}'::jsonb)) loop
    if exists (select 1 from public.field f where f.field_key = v_key) then
      insert into public.response_value (response_type, response_id, chii_id, field_key, value_text, value_number, value_json)
      values (
        v_type, v_id, v_chii, v_key,
        case when jsonb_typeof(v_val) in ('string', 'boolean') then v_val #>> '{}' end,
        case when jsonb_typeof(v_val) = 'number' then (v_val #>> '{}')::numeric end,
        case when jsonb_typeof(v_val) in ('array', 'object') then v_val end
      )
      on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object('recorded', true);
end;
$$;

revoke execute on function public.submit_template_feedback(text, text, jsonb) from public;
grant execute on function public.submit_template_feedback(text, text, jsonb) to anon, authenticated;

-- 4. The feedback workbook: CHII feedback, and session feedback from template forms.
drop view if exists public.v_workbook_feedback;
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
) rv on true
union all
select
  fb.id as feedback_id,
  bi.chii_id,
  iv.id as intervention_id,
  iv.name as intervention,
  iv.pillar::text as pillar,
  s.title as cohort,
  p.email::text as email,
  p.name as name,
  case
    when coalesce(array_length(s.dates, 1), 0) > 0 and att.attended::numeric / array_length(s.dates, 1) >= s.completion_threshold then 'Completed'
    when att.attended > 0 then 'Partially completed'
    else 'Did not complete'
  end as completion_status,
  fb.submitted_at,
  rv.relevance,
  rv.quality,
  rv.utility,
  rv.skills_confidence,
  rv.next_action,
  rv.support_needed,
  coalesce(rv.nps, fb.nps::text) as nps,
  rv.most_valuable,
  rv.improvements
from public.feedback fb
join public.sessions s on s.id = fb.session_id
join public.interventions iv on iv.id = s.intervention_id
join public.participants p on p.id = fb.participant_id
left join public.beneficiary_identity bi on bi.email = p.email
left join lateral (
  select count(*)::int as attended from public.attendance a where a.session_id = s.id and a.participant_id = p.id
) att on true
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
  where v.response_type = 'session_feedback' and v.response_id = fb.id
) rv on true;

grant select on public.v_workbook_feedback to authenticated;
revoke select on public.v_workbook_feedback from anon;
