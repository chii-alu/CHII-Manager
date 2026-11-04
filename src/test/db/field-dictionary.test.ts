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
    const fb = await db.query<{ n: number }>("select count(*)::int n from field where domain = 'feedback' and scope = 'global'");
    expect(fb.rows[0].n).toBe(16);
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
      "select i.name, t.title, jsonb_array_length(t.questions)::int n from feedback_template t join interventions i on i.id = t.intervention_id order by i.name",
    );
    expect(r.rows).toEqual([
      { name: "Career Workshops", title: "HealthX feedback", n: 11 },
      { name: "Internships", title: "Internship feedback", n: 14 },
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
