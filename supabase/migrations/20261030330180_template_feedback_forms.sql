-- Feedback forms built from a feedback template (intern and employer), on the sessions that use them.

-- 1. A session can have an employer feedback form beside its intern form.
alter type public.form_kind add value if not exists 'employer_feedback';

alter table public.forms drop constraint if exists forms_template_check;
alter table public.forms add constraint forms_template_check check (template in ('masterclass_series', 'feedback_template'));

-- 2. Every intern template starts with the email the person registered with, which is how we find them.
update public.feedback_template
set questions = jsonb_build_array(jsonb_build_object('id', 'email', 'label', 'Email you registered with', 'type', 'email', 'required', true))
  || questions
where audience = 'intern' and not (questions @> '[{"id": "email"}]');

-- 3. Employer responses: one per student per session (the student is the participant).
create table public.employer_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.participants (id),
  nps int check (nps between 0 and 10),
  answers jsonb not null default '{}',
  submitted_at timestamptz not null default now(),
  unique (session_id, participant_id)
);
alter table public.employer_feedback enable row level security;
create policy employer_feedback_access on public.employer_feedback for all
  using (exists (select 1 from public.sessions s where s.id = session_id and public.can_access_pillar(s.pillar)))
  with check (exists (select 1 from public.sessions s where s.id = session_id and public.can_access_pillar(s.pillar)));

-- 4. A feedback form made on a session uses the intern template for that intervention.
create function public.set_template_on_feedback_form()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'feedback' and new.template is null and exists (
    select 1 from public.sessions s
    join public.feedback_template t on t.intervention_id = s.intervention_id and t.audience = 'intern'
    where s.id = new.session_id
  ) then
    new.template := 'feedback_template';
  end if;
  return new;
end;
$$;

create trigger forms_feedback_template
before insert on public.forms
for each row execute function public.set_template_on_feedback_form();

-- 5. A new session gets an employer form when its intervention has an employer template.
create function public.create_employer_form()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  if exists (select 1 from public.feedback_template t where t.intervention_id = new.intervention_id and t.audience = 'employer') then
    select name into v_name from public.interventions where id = new.intervention_id;
    insert into public.forms (session_id, kind, code, status, questions, template)
    values (new.id, 'employer_feedback',
            new.pillar::text || '-' || public.intervention_initials(v_name) || '-' || lpad(new.seq::text, 3, '0') || '-EMP',
            'draft', '[]', 'feedback_template');
  end if;
  return new;
end;
$$;

create trigger sessions_employer_form
after insert on public.sessions
for each row execute function public.create_employer_form();
