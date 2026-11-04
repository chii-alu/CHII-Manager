// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN, HENT_STAFF, asAnon, asUser, setupDb } from "./harness";

let db: PGlite;
const HECO_STAFF = "00000000-0000-0000-0000-00000000000f";

beforeAll(async () => {
  db = await setupDb();
  await db.exec(`insert into auth.users (id, email) values ('${HECO_STAFF}', 'heco-registry@mela.test') on conflict do nothing;
    insert into staff_roles (user_id, role, pillars) values ('${HECO_STAFF}', 'pillar_staff', '{HECO}') on conflict do nothing;`);
  const hent = (await db.query<{ id: string }>("insert into cohort (intervention_id, label) select id, 'Registry HENT' from interventions where name = 'Masterclass' and pillar = 'HENT' returning id")).rows[0].id;
  const heco = (await db.query<{ id: string }>("insert into cohort (intervention_id, label) select id, 'Registry HECO' from interventions where name = 'Public Sector Fellowship' and pillar = 'HECO' returning id")).rows[0].id;
  const hentPerson = (await db.query<{ r: { chii_id: string } }>("select public.resolve_beneficiary('Registry Hent', 'reg.hent@example.org', null, null, null, '{}'::jsonb) as r")).rows[0].r.chii_id;
  const hecoPerson = (await db.query<{ r: { chii_id: string } }>("select public.resolve_beneficiary('Registry Heco', 'reg.heco@example.org', null, null, null, '{}'::jsonb) as r")).rows[0].r.chii_id;
  await db.exec(`
    insert into participation (chii_id, cohort_id, status) values ('${hentPerson}', '${hent}', 'registered'), ('${hecoPerson}', '${heco}', 'registered');
    insert into session_meeting (cohort_id, session_date, title) values ('${hent}', '2027-03-01', 'Session A');
    insert into session_attendance (session_id, chii_id, method) select id, '${hentPerson}', 'staff' from session_meeting where cohort_id = '${hent}';
    insert into cohort_feedback (chii_id, cohort_id, satisfaction, nps) values ('${hentPerson}', '${hent}', 4, 9), ('${hecoPerson}', '${heco}', 3, 6);
  `);
});

describe("registry views", () => {
  it("MELA admins see every participation, attendance and feedback row, across pillars", async () => {
    expect((await asUser(db, ADMIN, "select count(*)::int n from v_participant_registry")).rows[0].n).toBe(2);
    expect((await asUser(db, ADMIN, "select count(*)::int n from v_attendance_registry")).rows[0].n).toBe(1);
    expect((await asUser(db, ADMIN, "select count(*)::int n from v_feedback_registry")).rows[0].n).toBe(2);
  });

  it("pillar staff see only their own pillar's rows", async () => {
    const hent = await asUser(db, HENT_STAFF, "select pillar from v_participant_registry");
    expect(hent.rows.map((r: { pillar: string }) => r.pillar)).toEqual(["HENT"]);
    const heco = await asUser(db, HECO_STAFF, "select pillar from v_feedback_registry");
    expect(heco.rows.map((r: { pillar: string }) => r.pillar)).toEqual(["HECO"]);
  });

  it("the attendance count is the number of sessions attended in the cohort", async () => {
    const r = await asUser(db, ADMIN, "select sessions_attended, sessions_total from v_participant_registry where cohort = 'Registry HENT'");
    expect(r.rows[0]).toEqual({ sessions_attended: 1, sessions_total: 1 });
  });

  it("identity shows for pillar staff only for their own pillar's people", async () => {
    const hent = await asUser(db, HENT_STAFF, "select full_name, email from v_participant_registry");
    expect(hent.rows[0].full_name).toBe("Registry Hent");
    const heco = await asUser(db, HECO_STAFF, "select full_name from v_participant_registry");
    expect(heco.rows.map((r: { full_name: string | null }) => r.full_name)).toEqual(["Registry Heco"]);
  });

  it("anonymous visitors cannot read the registries", async () => {
    await expect(asAnon(db, "select * from v_participant_registry")).rejects.toThrow(/permission denied/);
  });
});
