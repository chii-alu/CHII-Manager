-- Exposure Events intern feedback: the Career Workshops template, with the programme name changed to Exposure Event.
insert into public.feedback_template (intervention_id, audience, title, questions)
select e.id, 'intern', 'Exposure Events feedback', replace(t.questions::text, 'Career Workshop', 'Exposure Event')::jsonb
from public.feedback_template t
join public.interventions c on c.id = t.intervention_id and c.name = 'Career Workshops' and c.pillar = 'HEMP'
cross join public.interventions e
where e.name = 'Exposure Events' and e.pillar = 'HEMP' and t.audience = 'intern'
on conflict (intervention_id, audience) do nothing;
