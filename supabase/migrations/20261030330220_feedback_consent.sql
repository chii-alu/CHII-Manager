-- Consent on every feedback form: the same statement the registration forms use, asked straight after the identifying question.
insert into public.field (field_key, label, type, domain) values
  ('consent', 'Consent', 'yesno', 'feedback')
on conflict (field_key) do nothing;

-- Intern templates: the email question is first, so consent goes second.
update public.feedback_template
set questions = jsonb_insert(questions, '{1}', '{"id":"consent","label":"I consent to my information being used to run this programme and for monitoring, evaluation and learning.","type":"consent","required":true}'::jsonb)
where audience = 'intern' and not (questions @> '[{"id":"consent"}]');

-- Employer template: the student email question is second, so consent goes third.
update public.feedback_template
set questions = jsonb_insert(questions, '{2}', '{"id":"consent","label":"I consent to my feedback being used to run this programme and for monitoring, evaluation and learning.","type":"consent","required":true}'::jsonb)
where audience = 'employer' and not (questions @> '[{"id":"consent"}]');
