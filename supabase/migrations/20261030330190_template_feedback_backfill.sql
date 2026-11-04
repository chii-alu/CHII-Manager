-- Existing sessions: their feedback forms use the intern template, and each gets an employer form if its intervention has one.
update public.forms f
set template = 'feedback_template'
from public.sessions s
join public.feedback_template t on t.intervention_id = s.intervention_id and t.audience = 'intern'
where s.id = f.session_id and f.kind = 'feedback' and f.template is null;

insert into public.forms (session_id, kind, code, status, questions, template)
select s.id, 'employer_feedback',
       s.pillar::text || '-' || public.intervention_initials(i.name) || '-' || lpad(s.seq::text, 3, '0') || '-EMP',
       'draft', '[]', 'feedback_template'
from public.sessions s
join public.interventions i on i.id = s.intervention_id
join public.feedback_template t on t.intervention_id = s.intervention_id and t.audience = 'employer'
where not exists (select 1 from public.forms f where f.session_id = s.id and f.kind = 'employer_feedback');
