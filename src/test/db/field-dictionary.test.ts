// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN, HENT_STAFF, asAnon, asUser, setupDb } from "./harness";

let db: PGlite;
const HECO_STAFF = "00000000-0000-0000-0000-00000000000f";

beforeAll(async () => {
  db = await setupDb();
  await db.exec(`insert into auth.users (id, email) values ('${HECO_STAFF}', 'heco-fields@mela.test') on conflict do nothing;
    insert into staff_roles (user_id, role, pillars) values ('${HECO_STAFF}', 'pillar_staff', '{HECO}') on conflict do nothing;`);
});

describe("field dictionary", () => {
  it("seeds the 16 core feedback fields and the core profile fields", async () => {
    const shared = await db.query<{ n: number }>(
      "select count(*)::int n from field where field_key in ('completed','internship_name','relevance','quality','usefulness','role_clarity','supervision','skills_applied','confidence','gains','top_skills','next_action','support_needed','nps','most_valuable','improvements')",
    );
    expect(shared.rows[0].n).toBe(16);
    const profile = await db.query<{ field_key: string; restricted: boolean }>("select field_key, restricted from field where domain = 'profile'");
    expect(profile.rows.map((r) => r.field_key)).toEqual(expect.arrayContaining(["email", "student_id", "financial_status", "nationality"]));
    expect(profile.rows.find((r) => r.field_key === "email")?.restricted).toBe(true);
    expect(profile.rows.find((r) => r.field_key === "nationality")?.restricted).toBe(false);
  });

  it("only admins create global fields; pillar staff create fields for their own pillar", async () => {
    await expect(asUser(db, HENT_STAFF, "insert into field (field_key, label, type, domain) values ('global_try', 'x', 'text', 'registration')")).rejects.toThrow(/row-level security/);
    await asUser(db, ADMIN, "insert into field (field_key, label, type, domain) values ('global_ok', 'x', 'text', 'registration')");
    await asUser(db, HENT_STAFF, "insert into field (field_key, label, type, domain, scope, pillar) values ('venture_stage_hent', 'Venture stage', 'single', 'registration', 'pillar', 'HENT')");
    await expect(asUser(db, HECO_STAFF, "insert into field (field_key, label, type, domain, scope, pillar) values ('hent_field_try', 'x', 'text', 'registration', 'pillar', 'HENT')")).rejects.toThrow(/row-level security/);
  });

  it("rejects a pillar field without a pillar, and a global field with one", async () => {
    await expect(db.query("insert into field (field_key, label, type, domain, scope) values ('bad_scope', 'x', 'text', 'registration', 'pillar')")).rejects.toThrow(/check constraint/);
    await expect(db.query("insert into field (field_key, label, type, domain, scope, pillar) values ('bad_global', 'x', 'text', 'registration', 'global', 'HENT')")).rejects.toThrow(/check constraint/);
  });

  it("anonymous visitors cannot read the dictionary", async () => {
    expect((await asAnon(db, "select * from field")).rows).toHaveLength(0);
  });
});

describe("response values", () => {
  let hentFeedback: string;
  let hecoFeedback: string;

  beforeAll(async () => {
    const hent = (await db.query<{ id: string }>(
      "insert into cohort (intervention_id, label) select id, 'Value HENT' from interventions where name = 'Masterclass' and pillar = 'HENT' returning id")).rows[0];
    const heco = (await db.query<{ id: string }>(
      "insert into cohort (intervention_id, label) select id, 'Value HECO' from interventions where name = 'Public Sector Fellowship' and pillar = 'HECO' returning id")).rows[0];
    const person = (await db.query<{ r: { chii_id: string } }>("select public.resolve_beneficiary('Value Tester', 'value@example.org', null, null, null, '{}'::jsonb) as r")).rows[0].r.chii_id;
    hentFeedback = (await db.query<{ id: string }>("insert into cohort_feedback (chii_id, cohort_id) values ($1, $2) returning id", [person, hent.id])).rows[0].id;
    hecoFeedback = (await db.query<{ id: string }>("insert into cohort_feedback (chii_id, cohort_id) values ($1, $2) returning id", [person, heco.id])).rows[0].id;
    await db.exec(`insert into response_value (response_type, response_id, chii_id, field_key, value_number)
      select 'feedback', '${hentFeedback}', chii_id, 'relevance', 4 from cohort_feedback where id = '${hentFeedback}';
      insert into response_value (response_type, response_id, chii_id, field_key, value_number)
      select 'feedback', '${hecoFeedback}', chii_id, 'relevance', 2 from cohort_feedback where id = '${hecoFeedback}';`);
  });

  it("pillar staff see the answers for their own pillar only; admins see all", async () => {
    const hent = await asUser(db, HENT_STAFF, "select response_id::text from response_value");
    expect(hent.rows.map((r: { response_id: string }) => r.response_id)).toEqual([hentFeedback]);
    const heco = await asUser(db, HECO_STAFF, "select response_id::text from response_value");
    expect(heco.rows.map((r: { response_id: string }) => r.response_id)).toEqual([hecoFeedback]);
    const admin = await asUser(db, ADMIN, "select count(*)::int n from response_value");
    expect(admin.rows[0].n).toBe(2);
  });

  it("refuses a value for a field that does not exist", async () => {
    await expect(
      db.query("insert into response_value (response_type, response_id, chii_id, field_key, value_text) select 'feedback', id, chii_id, 'no_such_field', 'x' from cohort_feedback where id = $1", [hentFeedback]),
    ).rejects.toThrow(/foreign key/);
  });

  it("anonymous visitors cannot read any answers", async () => {
    await expect(asAnon(db, "select * from response_value")).rejects.toThrow(/permission denied/);
  });
});

describe("feedback templates", () => {
  it("seeds the HealthX template for Career Workshops and the Internship template for Internships", async () => {
    const r = await db.query<{ name: string; title: string; n: number }>(
      "select i.name, t.title, jsonb_array_length(t.questions)::int n from feedback_template t join interventions i on i.id = t.intervention_id where t.audience = 'intern' order by i.name",
    );
    expect(r.rows).toEqual([
      { name: "Career Workshops", title: "HealthX feedback", n: 13 },
      { name: "Internships", title: "Internship feedback", n: 16 },
      { name: "SIE", title: "SIE feedback", n: 13 },
    ]);
  });

  it("refuses a question that is not in the field dictionary", async () => {
    await expect(
      db.query(
        "update feedback_template set questions = '[{\"id\":\"no_such_field\",\"label\":\"x\",\"type\":\"text\",\"required\":false}]'::jsonb where title = 'HealthX feedback'",
      ),
    ).rejects.toThrow(/not in the field dictionary/);
  });

  it("only staff of the intervention's pillar edit its template", async () => {
    // Row security silently skips the update for another pillar's staff.
    await asUser(db, HECO_STAFF, "update feedback_template set title = 'hacked' where title = 'HealthX feedback'");
    const still = await db.query<{ title: string }>("select title from feedback_template where title = 'HealthX feedback'");
    expect(still.rows).toHaveLength(1);
  });
});

describe("employer feedback template", () => {
  it("the internship intern and employer templates are separate", async () => {
    const r = await db.query<{ audience: string; n: number }>(
      "select t.audience, jsonb_array_length(t.questions)::int n from feedback_template t join interventions i on i.id = t.intervention_id where i.name = 'Internships' order by t.audience",
    );
    expect(r.rows).toEqual([
      { audience: "employer", n: 22 },
      { audience: "intern", n: 16 },
    ]);
  });

  it("an intervention has one template per audience", async () => {
    await expect(
      db.query("insert into feedback_template (intervention_id, audience, title, questions) select id, 'intern', 'dup', '[]' from interventions where name = 'Internships'"),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("template feedback forms", () => {
  let session: string;
  let student: string;
  let internEmail: string;

  beforeAll(async () => {
    const iv = (await db.query<{ id: string; pillar: string }>("select id, pillar::text from interventions where name = 'Internships' and pillar = 'HEMP'")).rows[0];
    // A new session gets an employer form beside its intern form, and its intern form uses the template.
    await db.exec(`insert into sessions (intervention_id, pillar, kind, title, dates) values ('${iv.id}', 'HEMP', 'registration', 'Internship test round', array['2027-02-01']::date[]);`);
    session = (await db.query<{ id: string }>("select id from sessions where title = 'Internship test round'")).rows[0].id;
    await db.exec(`insert into forms (session_id, kind, code, status, questions) values ('${session}', 'feedback', 'HEMP-TEST-FBK', 'open', '[]');`);
    internEmail = "intern.one@example.org";
    student = (await db.query<{ id: string }>(
      `insert into participants (pid, name, email) values ('TEST-0001', 'Intern One', '${internEmail}') returning id`,
    )).rows[0].id;
    await db.exec(`insert into attendance (session_id, participant_id, date) values ('${session}', '${student}', '2027-02-01');
      insert into entries (session_id, participant_id, status) values ('${session}', '${student}', 'selected');`);
  });

  it("a new internship session gets an employer form, and its feedback form uses the intern template", async () => {
    const r = await db.query<{ kind: string; template: string | null; code: string }>(
      "select kind::text, template, code from forms where session_id = $1 order by kind::text",
      [session],
    );
    expect(r.rows.map((f) => f.kind)).toEqual(["employer_feedback", "feedback"]);
    expect(r.rows.find((f) => f.kind === "employer_feedback")?.code).toMatch(/^HEMP-I-\d{3}-EMP$/);
    expect(r.rows.find((f) => f.kind === "feedback")?.template).toBe("feedback_template");
  });

  it("the public lookup returns the intern template's questions for a feedback form", async () => {
    const r = await asAnon(db, "select public.get_public_form('HEMP-TEST-FBK') as f");
    expect(r.rows[0].f.template).toBe("feedback_template");
  });

  it("records an intern's feedback for a person who attended", async () => {
    const r = await asAnon(db, "select public.submit_template_feedback('HEMP-TEST-FBK', $1, $2::jsonb) as r", [internEmail, JSON.stringify({ email: internEmail, nps: 9, relevance: "Very relevant" })]);
    expect(r.rows[0].r).toEqual({ recorded: true });
    const rows = await db.query<{ nps: number }>("select nps from feedback where session_id = $1", [session]);
    expect(rows.rows[0].nps).toBe(9);
  });

  it("refuses an intern who did not attend, and a second response", async () => {
    await expect(asAnon(db, "select public.submit_template_feedback('HEMP-TEST-FBK', 'nobody@example.org', '{}'::jsonb)")).rejects.toThrow(/no attendance record/);
    await expect(asAnon(db, "select public.submit_template_feedback('HEMP-TEST-FBK', $1, '{}'::jsonb)", [internEmail])).rejects.toThrow(/already been recorded/);
  });

  it("records an employer's feedback about a registered student, and keeps it apart from the intern's", async () => {
    const emp = (await db.query<{ code: string }>("select code from forms where session_id = $1 and kind = 'employer_feedback'", [session])).rows[0].code;
    await db.exec("update forms set status = 'open' where code = '" + emp + "'");
    const r = await asAnon(db, "select public.submit_template_feedback($1, $2, $3::jsonb) as r", [emp, internEmail, JSON.stringify({ student_email: internEmail, performance_rating: 8 })]);
    expect(r.rows[0].r).toEqual({ recorded: true });
    const rows = await db.query<{ n: number }>("select count(*)::int n from employer_feedback where session_id = $1", [session]);
    expect(rows.rows[0].n).toBe(1);
  });
});

describe("feedback consent", () => {
  it("every feedback template asks for consent, as a required question", async () => {
    const r = await db.query<{ audience: string; ok: boolean }>(
      "select audience, bool_or(q->>'id' = 'consent' and q->>'type' = 'consent' and (q->>'required')::boolean) as ok from feedback_template, jsonb_array_elements(questions) q group by audience",
    );
    expect(r.rows.every((x) => x.ok)).toBe(true);
  });
});

