-- Feedback templates per intervention (WORKBOOKS-AND-FLEXIBLE-FIELDS §3, §4). Each intervention's feedback form has its own
-- wording and options. A question's id is a field key, so the same key keeps one column in exports across interventions.

create table public.feedback_template (
  intervention_id uuid primary key references public.interventions (id),
  title text not null,
  questions jsonb not null default '[]',
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

-- Every question must use a field that exists in the dictionary.
create function public.check_feedback_template()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  q jsonb;
begin
  for q in select value from jsonb_array_elements(new.questions) loop
    if not exists (select 1 from public.field f where f.field_key = q ->> 'id') then
      raise exception 'Feedback question % is not in the field dictionary', q ->> 'id' using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;

create trigger feedback_template_check
before insert or update of questions on public.feedback_template
for each row execute function public.check_feedback_template();

alter table public.feedback_template enable row level security;
create policy feedback_template_read on public.feedback_template for select using (public.is_staff());
create policy feedback_template_write on public.feedback_template for all
  using (exists (select 1 from public.interventions i where i.id = intervention_id and public.can_access_pillar(i.pillar)))
  with check (exists (select 1 from public.interventions i where i.id = intervention_id and public.can_access_pillar(i.pillar)));

-- The two templates we have so far. Other interventions get their template when their forms are provided.
insert into public.feedback_template (intervention_id, title, questions)
select i.id, 'HealthX feedback', $json$[{"id": "completed", "label": "Did you complete the programme?", "type": "single", "required": true, "options": ["Yes, I completed all programme activities", "I completed most activities", "I completed some activities", "I withdrew before completion"]}, {"id": "relevance", "label": "How relevant was the HealthX programme to your health mission and career goals?", "type": "single", "required": true, "options": ["Not relevant at all", "Somewhat relevant", "Moderately relevant", "Very relevant", "Extremely relevant"]}, {"id": "quality", "label": "How would you rate the quality of the HealthX programme (content, facilitation, learning experiences)?", "type": "single", "required": true, "options": ["Poor quality", "Below average", "Average/Acceptable", "Good quality", "Excellent quality"]}, {"id": "usefulness", "label": "How useful was the HealthX programme in helping you apply your skills to real-world health system contexts and understand employment pathways?", "type": "single", "required": false, "options": ["Not useful at all", "Somewhat useful", "Moderately useful", "Very useful", "Extremely useful - I have clear next steps"]}, {"id": "confidence", "label": "After the HealthX programme, how confident are you in your ability to apply your skills [technology/entrepreneurship/leadership] to solve real-world health challenges?", "type": "single", "required": false, "options": ["Not confident at all", "Slightly confident", "Moderately confident", "Very confident", "Extremely confident"]}, {"id": "gains", "label": "Which of the following did you gain from this experience? (Select all that apply)", "type": "multi", "required": false, "options": ["Understanding of health system functioning in Africa", "Exposure to diverse health sector employment pathways", "Practical skills to apply in health contexts", "Networking with health professionals and organizations", "Clarity on my career direction in health", "Confidence in my health mission", "Other, please specify"]}, {"id": "next_action", "label": "What specific action will you take next based on what you learned? (e.g. pursue a health sector internship, launch a health venture, apply for a health role, continue health mission work, seek mentorship)", "type": "long", "required": false}, {"id": "support_needed", "label": "What support do you need to move forward?", "type": "multi", "required": false, "options": ["Mentorship", "Funding", "Job placement support", "Peer network", "Further training", "Other"]}, {"id": "nps", "label": "Would you recommend the HealthX programme to other health mission students on a scale of 0-10? (0 = Not at all likely, 10 = Extremely likely)", "type": "scale10", "required": true}, {"id": "most_valuable", "label": "What was most valuable about this experience?", "type": "long", "required": false}, {"id": "improvements", "label": "What could be improved for future editions?", "type": "long", "required": false}]$json$::jsonb
from public.interventions i where i.name = 'Career Workshops' and i.pillar = 'HEMP';

insert into public.feedback_template (intervention_id, title, questions)
select i.id, 'Internship feedback', $json$[{"id": "completed", "label": "Did you complete the internship?", "type": "single", "required": true, "options": ["Yes, I completed the full internship", "I withdrew before completing the internship", "My internship was terminated"]}, {"id": "internship_name", "label": "Which internship did you participate in?", "type": "text", "required": true}, {"id": "relevance", "label": "How relevant was the internship to your Health Mission and career goals?", "type": "single", "required": true, "options": ["Not relevant at all", "Somewhat relevant", "Moderately relevant", "Very relevant", "Extremely relevant"]}, {"id": "quality", "label": "How would you rate the overall quality of your internship experience?", "type": "single", "required": true, "options": ["Poor", "Below average", "Average/Acceptable", "Good", "Excellent"]}, {"id": "role_clarity", "label": "How clear were your role, responsibilities, and expected deliverables?", "type": "single", "required": false, "options": ["Not clear at all", "Slightly clear", "Moderately clear", "Very clear", "Extremely clear"]}, {"id": "supervision", "label": "How would you rate the support and supervision you received?", "type": "single", "required": false, "options": ["Very poor", "Poor", "Adequate", "Good", "Excellent"]}, {"id": "skills_applied", "label": "To what extent did the internship help you apply your skills and knowledge to real-world health challenges?", "type": "single", "required": false, "options": ["Not at all", "To a small extent", "To a moderate extent", "To a great extent", "To a very great extent"]}, {"id": "gains", "label": "Which of the following did you gain from this internship? (Select all that apply)", "type": "multi", "required": false, "options": ["Practical experience in a professional health environment", "Understanding of health systems and service delivery", "Exposure to health sector career pathways", "Opportunities to apply my skills", "Improved professional and teamwork skills", "Networking with health professionals and organisations", "Clarity about my career direction", "Confidence in my Health Mission", "Other, please specify"]}, {"id": "top_skills", "label": "What are the top 2-3 skills, knowledge, or competencies you developed during this internship?", "type": "long", "required": false}, {"id": "next_action", "label": "What specific action will you take next based on this internship experience? (e.g. apply for a health role or internship, pursue further training, continue your Health Mission, seek mentorship, start a health venture)", "type": "long", "required": false}, {"id": "support_needed", "label": "What support do you need to move forward?", "type": "multi", "required": false, "options": ["Mentorship", "Job or internship placement support", "Networking opportunities", "Further training", "Career guidance", "Support for my Health Mission", "Funding", "Other, please specify"]}, {"id": "nps", "label": "Would you recommend this internship opportunity to another ALU student on a scale of 0-10? (0 = Not at all likely, 10 = Extremely likely)", "type": "scale10", "required": true}, {"id": "most_valuable", "label": "What was most valuable about your internship experience?", "type": "long", "required": false}, {"id": "improvements", "label": "What could be improved for future interns or internship opportunities?", "type": "long", "required": false}]$json$::jsonb
from public.interventions i where i.name = 'Internships' and i.pillar = 'HEMP';
