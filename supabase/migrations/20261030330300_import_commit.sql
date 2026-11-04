-- Committing a sheet import (WORKBOOKS-AND-FLEXIBLE-FIELDS §4). Only staff who can access the cohort can import into it.

-- A registration from a sheet: the same matching and registration rules as the public form. The sheet must record consent.
create function public.import_registration(p_cohort uuid, p_profile jsonb, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_cohort(p_cohort) then
    raise exception 'Not allowed to import into this cohort' using errcode = '42501';
  end if;
  return public.register_for_cohort(p_cohort, p_profile, p_answers);
end;
$$;

-- A feedback response from a sheet: the person is matched by email (or created), and the answers are kept as CHII data.
create function public.import_feedback(p_cohort uuid, p_email text, p_name text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id text;
  v_fb uuid;
  v_key text;
  v_val jsonb;
begin
  if not public.can_access_cohort(p_cohort) then
    raise exception 'Not allowed to import into this cohort' using errcode = '42501';
  end if;
  if v_email = '' then
    raise exception 'An email address is needed' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chii-email:' || v_email, 0));
  select i.chii_id into v_id from public.beneficiary_identity i where i.email = v_email limit 1;
  if v_id is null then
    v_id := public.mint_chii_id();
    insert into public.beneficiary (chii_id) values (v_id);
    insert into public.beneficiary_identity (chii_id, full_name, email)
    values (v_id, coalesce(trim(p_name), ''), v_email);
  end if;

  if exists (select 1 from public.cohort_feedback f where f.chii_id = v_id and f.cohort_id = p_cohort) then
    raise exception 'Feedback from this person is already recorded for this cohort' using errcode = '23505';
  end if;

  insert into public.cohort_feedback (chii_id, cohort_id, nps, answers)
  values (v_id, p_cohort, nullif(p_answers ->> 'nps', '')::int, coalesce(p_answers, '{}'::jsonb))
  returning id into v_fb;

  for v_key, v_val in select key, value from jsonb_each(coalesce(p_answers, '{}'::jsonb)) loop
    if exists (select 1 from public.field f where f.field_key = v_key) then
      insert into public.response_value (response_type, response_id, chii_id, field_key, value_text, value_number, value_json)
      values (
        'feedback', v_fb, v_id, v_key,
        case when jsonb_typeof(v_val) in ('string', 'boolean') then v_val #>> '{}' end,
        case when jsonb_typeof(v_val) = 'number' then (v_val #>> '{}')::numeric end,
        case when jsonb_typeof(v_val) in ('array', 'object') then v_val end
      )
      on conflict do nothing;
    end if;
  end loop;

  return jsonb_build_object('recorded', true);
end;
$$;

revoke execute on function public.import_registration(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.import_feedback(uuid, text, text, jsonb) from public, anon;
grant execute on function public.import_registration(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.import_feedback(uuid, text, text, jsonb) to authenticated;
