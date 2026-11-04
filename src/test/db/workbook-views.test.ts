// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN, HENT_STAFF, asAnon, asUser, setupDb } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await setupDb();
  const hent = (await db.query<{ id: string }>("insert into cohort (intervention_id, label, completion_threshold) select id, 'Workbook HENT', 0.5 from interventions where name = 'Masterclass' and pillar = 'HENT' returning id")).rows[0].id;
  const person = (await db.query<{ r: { chii_id: string } }>("select public.resolve_beneficiary('Workbook Person', 'workbook@example.org', null, 'WB-1', 'student', '{\"gender\":\"Female\",\"residence_country\":\"Rwanda\"}'::jsonb) as r")).rows[0].r.chii_id;
  await db.exec(`
    insert into participation (chii_id, cohort_id, status) values ('${person}', '${hent}', 'registered');
    insert into session_meeting (cohort_id, session_date, title) values ('${hent}', '2027-03-01', 'One'), ('${hent}', '2027-03-08', 'Two');
    insert into session_attendance (session_id, chii_id, method) select id, '${person}', 'staff' from session_meeting where cohort_id = '${hent}' and session_date = '2027-03-01';
    insert into cohort_feedback (chii_id, cohort_id, nps) values ('${person}', '${hent}', 8);
  `);
  const fb = (await db.query<{ id: string }>("select id from cohort_feedback limit 1")).rows[0].id;
  await db.exec(`insert into response_value (response_type, response_id, chii_id, field_key, value_text)
    select 'feedback', '${fb}', chii_id, 'quality', 'Good quality' from cohort_feedback where id = '${fb}';`);
});

describe("participant workbook view", () => {
  it("has one row per person per intervention, with the spec's values", async () => {
    const r = await asUser(db, ADMIN, "select * from v_workbook_participants where names = 'Workbook Person'");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].intervention).toBe("Masterclass");
    expect(r.rows[0].pillar).toBe("HENT");
    expect(r.rows[0].interventions).toBe("Masterclass");
    expect(r.rows[0].intervention_count).toBe(1);
    expect(r.rows[0].times_supported).toBe(1);
    expect(r.rows[0].gender).toBe("Female");
    expect(r.rows[0].country_of_residence).toBe("Rwanda");
    expect(r.rows[0].enrollment_status).toBe("Student");
  });

  it("pillar staff see the participants of their pillar", async () => {
    const r = await asUser(db, HENT_STAFF, "select count(*)::int n from v_workbook_participants");
    expect(r.rows[0].n).toBeGreaterThan(0);
  });

  it("anonymous visitors cannot read it", async () => {
    await expect(asAnon(db, "select * from v_workbook_participants")).rejects.toThrow(/permission denied/);
  });
});

describe("feedback workbook view", () => {
  it("gives each response its completion status and the pivoted answers", async () => {
    const r = await asUser(db, ADMIN, "select completion_status, quality, nps from v_workbook_feedback");
    expect(r.rows).toHaveLength(1);
    // Attended 1 of 2 sessions = 50%, which meets the cohort's 50% threshold.
    expect(r.rows[0].completion_status).toBe("Completed");
    expect(r.rows[0].quality).toBe("Good quality");
    expect(r.rows[0].nps).toBe("8");
  });
});
