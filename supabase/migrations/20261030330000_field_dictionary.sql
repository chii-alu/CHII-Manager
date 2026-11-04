-- Field dictionary (WORKBOOKS-AND-FLEXIBLE-FIELDS §4). A field is one question or attribute with a stable key.
-- Forms store the field key, so the same question in different cohorts lands in the same column.
-- Renaming a label changes the column header everywhere; the key never changes.

create table public.field (
  field_key text primary key check (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  label text not null check (length(trim(label)) > 0),
  type text not null check (type in ('text', 'long', 'number', 'date', 'single', 'multi', 'rating5', 'scale10', 'yesno', 'email', 'phone')),
  options jsonb not null default '[]',
  domain text not null check (domain in ('profile', 'registration', 'feedback')),
  scope text not null default 'global' check (scope in ('global', 'pillar', 'intervention')),
  pillar public.pillar,
  intervention_id uuid references public.interventions (id),
  restricted boolean not null default false,   -- personal or sensitive: data owner (admin) only in exports
  archived boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'global' and pillar is null and intervention_id is null)
    or (scope = 'pillar' and pillar is not null and intervention_id is null)
    or (scope = 'intervention' and intervention_id is not null)
  )
);

alter table public.field enable row level security;
create policy field_read on public.field for select using (public.is_staff());
-- Global fields are the MELA team's: admins only. Pillar and intervention fields can be created by that pillar's staff.
create policy field_write on public.field for all
  using (public.is_admin() or (scope <> 'global' and pillar is not null and public.can_access_pillar(pillar)))
  with check (public.is_admin() or (scope <> 'global' and pillar is not null and public.can_access_pillar(pillar)));

-- Seed: the core profile fields (answers that live on the person's CHII record).
insert into public.field (field_key, label, type, domain, restricted) values
  ('email', 'Email', 'email', 'profile', true),
  ('full_name', 'Names', 'text', 'profile', true),
  ('phone', 'Phone', 'phone', 'profile', true),
  ('student_id', 'Student ID', 'text', 'profile', true),
  ('gender', 'Gender', 'single', 'profile', false),
  ('gender_identity', 'Gender Identity', 'text', 'profile', false),
  ('nationality', 'Nationality', 'text', 'profile', false),
  ('birth_country', 'Country of Birth', 'text', 'profile', false),
  ('residence_country', 'Country of Residence', 'text', 'profile', false),
  ('residence_city', 'City of Residence', 'text', 'profile', false),
  ('humanitarian_status', 'Has Humanitarian Status', 'yesno', 'profile', false),
  ('disability_status', 'Disability Status', 'text', 'profile', false),
  ('enrolment_status', 'Enrollment Status', 'text', 'profile', false),
  ('year_group', 'Year Group', 'text', 'profile', false),
  ('academic_programme', 'Primary Academic Program', 'text', 'profile', false),
  ('financial_status', 'Financial Standing', 'text', 'profile', true),
  ('academic_status', 'Academic Standing', 'text', 'profile', true),
  ('disciplinary_status', 'Disciplinary Standing', 'text', 'profile', true);

-- Seed: the feedback fields shared by the intervention feedback forms. The key keeps one column in exports;
-- each intervention's template sets its own wording and options (see 20261030330050_feedback_templates.sql).
insert into public.field (field_key, label, type, domain) values
  ('completed', 'Completion Status', 'single', 'feedback'),
  ('internship_name', 'Internship', 'text', 'feedback'),
  ('relevance', 'Programme Relevance', 'single', 'feedback'),
  ('quality', 'Programme Quality', 'single', 'feedback'),
  ('usefulness', 'Programme Utility', 'single', 'feedback'),
  ('role_clarity', 'Role Clarity', 'single', 'feedback'),
  ('supervision', 'Supervision Quality', 'single', 'feedback'),
  ('skills_applied', 'Skills Applied', 'single', 'feedback'),
  ('confidence', 'Skills Confidence', 'single', 'feedback'),
  ('gains', 'Gains', 'multi', 'feedback'),
  ('top_skills', 'Top Skills Developed', 'long', 'feedback'),
  ('next_action', 'Next Action', 'long', 'feedback'),
  ('support_needed', 'Support Needed', 'multi', 'feedback'),
  ('nps', 'NPS Score', 'scale10', 'feedback'),
  ('most_valuable', 'Most Valuable Aspect', 'long', 'feedback'),
  ('improvements', 'Suggested Improvements', 'long', 'feedback');
