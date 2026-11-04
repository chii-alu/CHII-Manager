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

alter table public.participants alter column pid set default public.mint_chii_id();
