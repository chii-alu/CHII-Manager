-- Public feedback from a template form. The intern form matches the person by the email they registered with and
-- needs an attendance record (as before). The employer form matches the student by the student's email and needs
-- the student to be registered for the session.
create function public.submit_template_feedback(p_code text, p_email text, p_answers jsonb)
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
    values (v_session, v_participant.id, nullif(p_answers ->> 'nps', '')::int, coalesce(p_answers, '{}'::jsonb));
  else
    if not found or not exists (select 1 from public.entries e where e.session_id = v_session and e.participant_id = v_participant.id) then
      raise exception 'This student is not registered for this session. Check the student email address.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.employer_feedback ef where ef.session_id = v_session and ef.participant_id = v_participant.id) then
      raise exception 'Employer feedback for this student has already been recorded for this session.' using errcode = '23505';
    end if;
    insert into public.employer_feedback (session_id, participant_id, nps, answers)
    values (v_session, v_participant.id, nullif(p_answers ->> 'performance_rating', '')::int, coalesce(p_answers, '{}'::jsonb));
  end if;

  return jsonb_build_object('recorded', true);
end;
$$;

revoke execute on function public.submit_template_feedback(text, text, jsonb) from public;
grant execute on function public.submit_template_feedback(text, text, jsonb) to anon, authenticated;
