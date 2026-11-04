-- The public form lookup returns a template form's questions from its feedback template (intern or employer).
create or replace function public.get_public_form(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', f.code,
    'kind', f.kind,
    'status', f.status,
    'template', f.template,
    'questions', case
      when f.template = 'feedback_template' then (
        select t.questions from public.feedback_template t
        where t.intervention_id = s.intervention_id
          and t.audience = case when f.kind = 'employer_feedback' then 'employer' else 'intern' end
      )
      else f.questions
    end,
    'pillar', s.pillar,
    'intervention', i.name,
    'session', jsonb_build_object(
      'id', s.id,
      'title', s.title,
      'kind', s.kind,
      'dates', s.dates,
      'mode', s.mode,
      'venue', s.venue,
      'application_deadline', s.application_deadline,
      'capacity', s.capacity
    ),
    'today', public.programme_today()
  )
  from public.forms f
  join public.sessions s on s.id = f.session_id
  join public.interventions i on i.id = s.intervention_id
  where f.code = p_code;
$$;
