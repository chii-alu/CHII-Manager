// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN, asUser, setupDb } from "./harness";

let db: PGlite;
const HECO_STAFF = "00000000-0000-0000-0000-00000000000f";
let hentCohort: string;

beforeAll(async () => {
  db = await setupDb();
  await db.exec(`insert into auth.users (id, email) values ('${HECO_STAFF}', 'heco-import@mela.test') on conflict do nothing;
    insert into staff_roles (user_id, role, pillars) values ('${HECO_STAFF}', 'pillar_staff', '{HECO}') on conflict do nothing;`);
  hentCohort = (await db.query<{ id: string }>("insert into cohort (intervention_id, label) select id, 'Import HENT' from interventions where name = 'Masterclass' and pillar = 'HENT' returning id")).rows[0].id;
});

describe("import commit", () => {
  it("imports a registration into a cohort the admin can access", async () => {
    const profile = { email: "imported.one@example.org", full_name: "Imported One", phone: "+250780000001", consent: "yes" };
    const r = await asUser(db, ADMIN, "select public.import_registration($1, $2::jsonb, '{}'::jsonb) as r", [hentCohort, JSON.stringify(profile)]);
    expect(r.rows[0].r).toEqual({ registered: true });
    const p = await db.query<{ n: number }>("select count(*)::int n from participation p join beneficiary_identity i on i.chii_id = p.chii_id where i.email = 'imported.one@example.org' and p.cohort_id = $1", [hentCohort]);
    expect(p.rows[0].n).toBe(1);
  });

  it("refuses a second registration for the same person in the cohort", async () => {
    const profile = { email: "imported.one@example.org", full_name: "Imported One", consent: "yes" };
    await expect(asUser(db, ADMIN, "select public.import_registration($1, $2::jsonb, '{}'::jsonb)", [hentCohort, JSON.stringify(profile)])).rejects.toThrow(/already registered/);
  });

  it("refuses a row without recorded consent", async () => {
    const profile = { email: "no.consent@example.org", full_name: "No Consent" };
    await expect(asUser(db, ADMIN, "select public.import_registration($1, $2::jsonb, '{}'::jsonb)", [hentCohort, JSON.stringify(profile)])).rejects.toThrow(/Consent is needed/);
  });

  it("staff of another pillar cannot import into this cohort", async () => {
    const profile = { email: "not.mine@example.org", full_name: "Not Mine", consent: "yes" };
    await expect(asUser(db, HECO_STAFF, "select public.import_registration($1, $2::jsonb, '{}'::jsonb)", [hentCohort, JSON.stringify(profile)])).rejects.toThrow(/Not allowed/);
  });

  it("imports feedback as CHII data, and refuses a second response from the same person", async () => {
    const answers = { nps: "9", relevance: "Very relevant", most_valuable: "The mentors" };
    await asUser(db, ADMIN, "select public.import_feedback($1, 'feedback.one@example.org', 'Feedback One', $2::jsonb)", [hentCohort, JSON.stringify(answers)]);
    const rows = await db.query<{ n: number }>("select count(*)::int n from response_value rv join cohort_feedback f on f.id = rv.response_id where rv.response_type = 'feedback' and f.cohort_id = $1", [hentCohort]);
    expect(rows.rows[0].n).toBe(3);
    await expect(asUser(db, ADMIN, "select public.import_feedback($1, 'feedback.one@example.org', 'Feedback One', $2::jsonb)", [hentCohort, JSON.stringify(answers)])).rejects.toThrow(/already recorded/);
  });
});
