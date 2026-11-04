-- One ID follows a person across interventions: the participant ID is the person's CHII ID.
-- Existing participants take the CHII ID of the person with the same email (a new CHII ID is created if there is none).
-- New participants get a CHII ID by default.
do $$
declare
  r record;
begin
  for r in select p.id, p.name, p.email::text as email from public.participants p loop
    update public.participants
    set pid = (public.resolve_beneficiary(
      coalesce(nullif(trim(r.name), ''), r.email), r.email, null, null, 'student', '{}'::jsonb
    ) ->> 'chii_id')
    where id = r.id;
  end loop;
end
$$;

-- Callers (public form, staff) cannot run mint_chii_id directly, so a small wrapper runs with the owner's rights.
create function public.participant_pid()
returns text
language sql
security definer
set search_path = ''
as $$
  select public.mint_chii_id();
$$;

revoke execute on function public.participant_pid() from public;
grant execute on function public.participant_pid() to anon, authenticated;

alter table public.participants alter column pid set default public.participant_pid();
