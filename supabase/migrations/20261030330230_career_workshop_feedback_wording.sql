-- The Career Workshops intern feedback form: the same questions as HealthX, worded for Career Workshops.
update public.feedback_template t
set title = 'Career Workshops feedback',
    questions = replace(t.questions::text, 'HealthX', 'Career Workshop')::jsonb
from public.interventions i
where i.id = t.intervention_id and i.name = 'Career Workshops' and i.pillar = 'HEMP' and t.audience = 'intern';
