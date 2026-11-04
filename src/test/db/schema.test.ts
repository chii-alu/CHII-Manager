// @vitest-environment node
// Runs the real migrations and seed against an in-process Postgres (PGlite) with
// Supabase-style stubs for the auth schema and default grants. RLS is the real gate here.
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { interventionInitials } from "@/lib/rules/initials";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const SEED = path.join(ROOT, "supabase/seed.sql");

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const HENT_STAFF = "00000000-0000-0000-0000-00000000000b";

let db: PGlite;

// Typed loosely: these are assertion helpers over known test queries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function query<T = any>(sql: string, params: unknown[] = []) {
  return db.query<T>(sql, params);
}

async function asUser(uid: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false)`);
  try {
    return await query(sql, params);
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function asAnon(sql: string) {
  await db.exec("set role anon; select set_config('request.jwt.claim.sub', '', false)");
  try {
    return await query(sql);
  } finally {
    await db.exec("reset role");
  }
}

async function interventionId(name: string) {
  const r = await query<{ id: string }>("select id from interventions where name = $1", [name]);
  return r.rows[0].id;
}

type CreateArgs = Partial<{
  title: string;
  dates: string[];
  intake: unknown[];
  feedback: unknown[];
  rubric: { name: string; weight: number }[] | null;
  capacity: number | null;
}>;

function createSession(uid: string, ivId: string, args: CreateArgs = {}) {
  return asUser(
    uid,
    `select public.create_session($1, $2, $3::date[], $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb) as id`,
    [
      ivId,
      args.title ?? "Test session",
      args.dates ?? ["2026-11-12"],
      "In person",
      "Kigali",
      "HENT team",
      args.capacity ?? 20,
      null,
      JSON.stringify(args.intake ?? []),
      JSON.stringify(args.feedback ?? []),
      args.rubric === undefined ? null : JSON.stringify(args.rubric),
    ],
  );
}

beforeAll(async () => {
  db = await PGlite.create({ extensions: { citext } });
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  // Mirror Supabase's default grants; RLS is what actually restricts access.
  await db.exec(`
    grant all on all tables in schema public to authenticated, anon;
    grant usage, select on all sequences in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
  `);
  await db.exec(readFileSync(SEED, "utf8"));

  await db.exec(`
    insert into auth.users values ('${ADMIN}'), ('${HENT_STAFF}');
    insert into staff_roles (user_id, role, pillars) values
      ('${ADMIN}', 'admin', '{}'), ('${HENT_STAFF}', 'pillar_staff', '{HENT}');
  `);
});

describe("schema and RLS (SPEC §3, §8)", () => {
  it("seeds the 17 interventions", async () => {
    const r = await query<{ n: number }>("select count(*)::int n from interventions");
    expect(r.rows[0].n).toBe(17);
  });

  it("gives participants CHII IDs", async () => {
    const r = await query<{ pid: string }>(
      "insert into participants (email, name) values ('a@x.org','A'),('b@x.org','B') returning pid",
    );
    expect(r.rows.map((x) => x.pid)).toEqual(expect.arrayContaining([expect.stringMatching(/^CHII-\d{6}$/)]));
    expect(r.rows).toHaveLength(2);
  });

  it("treats emails as case-insensitive (citext)", async () => {
    await expect(query("insert into participants (email, name) values ('A@X.ORG','dup')")).rejects.toThrow();
  });

  it("writes status_history when an entry status changes", async () => {
    const p = (await query<{ id: string }>("select id from participants limit 1")).rows[0].id;
    const sid = (await createSession(ADMIN, await interventionId("Venture Funding"))).rows[0].id;
    await db.exec(`insert into entries (session_id, participant_id, status) values ('${sid}', '${p}', 'applied')`);
    await db.exec(`set request.jwt.claim.sub = '${ADMIN}'`);
    await db.exec(`update entries set status = 'shortlisted' where participant_id = '${p}'`);
    const h = await query<{ from_status: string; to_status: string; changed_by: string }>(
      "select from_status, to_status, changed_by from status_history",
    );
    expect(h.rows).toEqual([{ from_status: "applied", to_status: "shortlisted", changed_by: ADMIN }]);
  });

  it("pillar staff see only their pillar's sessions", async () => {
    const r = await asUser(HENT_STAFF, "select pillar from sessions");
    expect(r.rows.every((x: { pillar: string }) => x.pillar === "HENT")).toBe(true);
  });

  it("anon sees no interventions or participants", async () => {
    expect((await asAnon("select count(*)::int n from interventions")).rows[0]).toEqual({ n: 0 });
    expect((await asAnon("select count(*)::int n from participants")).rows[0]).toEqual({ n: 0 });
  });

  it("pillar staff cannot delete participants", async () => {
    const r = await asUser(HENT_STAFF, "delete from participants returning id");
    expect(r.rows).toHaveLength(0);
  });
});

describe("replace_rubric", () => {
  it("replaces a selective session's criteria in one step", async () => {
    const sid = (await createSession(ADMIN, await interventionId("Venture Funding"), { rubric: [{ name: "Old", weight: 100 }] })).rows[0].id;
    await asUser(ADMIN, "select public.replace_rubric($1, $2::jsonb)", [
      sid,
      JSON.stringify([{ name: "Motivation", weight: 60 }, { name: "Impact", weight: 40 }]),
    ]);
    const r = await query<{ name: string; position: number }>(
      "select name, position from rubric_criteria where session_id = $1 order by position",
      [sid],
    );
    expect(r.rows).toEqual([
      { name: "Motivation", position: 1 },
      { name: "Impact", position: 2 },
    ]);
  });

  it("refuses an open (registration) session", async () => {
    const sid = (await createSession(ADMIN, await interventionId("Masterclass"))).rows[0].id;
    await expect(
      asUser(ADMIN, "select public.replace_rubric($1, '[]'::jsonb)", [sid]),
    ).rejects.toThrow(/Only selective sessions/);
  });
});

describe("create_session (SPEC §4.2–4.4, §11)", () => {
  it("a Masterclass creates three forms with unique codes and no rubric", async () => {
    const ivId = await interventionId("Masterclass");
    const sid = (await createSession(ADMIN, ivId)).rows[0].id;
    const forms = await query<{ kind: string; code: string }>(
      "select kind, code from forms where session_id = $1 order by kind",
      [sid],
    );
    // Ordered by the form_kind enum: intake, attendance, feedback.
    expect(forms.rows.map((f) => f.kind)).toEqual(["intake", "attendance", "feedback"]);
    const codes = forms.rows.map((f) => f.code);
    expect(new Set(codes).size).toBe(3);
    expect(codes.every((c) => /^HENT-M-\d{3}-(REG|ATT|FBK)$/.test(c))).toBe(true);
    const kind = await query<{ kind: string }>("select kind from sessions where id = $1", [sid]);
    expect(kind.rows[0].kind).toBe("registration");
    const rubric = await query("select 1 from rubric_criteria where session_id = $1", [sid]);
    expect(rubric.rows).toHaveLength(0);
  });

  it("a selective session creates an application form, rubric and -APP code", async () => {
    const ivId = await interventionId("Venture Funding");
    const rubric = [
      { name: "Motivation and commitment", weight: 30 },
      { name: "Fit with eligibility criteria", weight: 30 },
      { name: "Potential for impact", weight: 40 },
    ];
    const sid = (await createSession(ADMIN, ivId, { rubric })).rows[0].id;
    const intake = await query<{ code: string }>("select code from forms where session_id = $1 and kind = 'intake'", [sid]);
    expect(intake.rows[0].code).toMatch(/^HENT-VF-\d{3}-APP$/);
    const crit = await query<{ name: string; weight: number; position: number }>(
      "select name, weight, position from rubric_criteria where session_id = $1 order by position",
      [sid],
    );
    expect(crit.rows.map((c) => [c.name, c.weight, c.position])).toEqual(rubric.map((r, i) => [r.name, r.weight, i + 1]));
  });

  it("each session gets its own codes (sequence numbers differ)", async () => {
    const ivId = await interventionId("Masterclass");
    const a = (await createSession(ADMIN, ivId)).rows[0].id;
    const b = (await createSession(ADMIN, ivId)).rows[0].id;
    const codes = await query<{ code: string }>(
      "select code from forms where session_id in ($1, $2) and kind = 'intake'",
      [a, b],
    );
    expect(new Set(codes.rows.map((r) => r.code)).size).toBe(2);
  });

  it("sorts and de-duplicates dates", async () => {
    const ivId = await interventionId("Masterclass");
    const sid = (await createSession(ADMIN, ivId, { dates: ["2026-11-02", "2026-11-01", "2026-11-02"] })).rows[0].id;
    const r = await query<{ dates: string[] }>("select dates::text[] as dates from sessions where id = $1", [sid]);
    expect(r.rows[0].dates).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("rejects a session without dates", async () => {
    const ivId = await interventionId("Masterclass");
    await expect(createSession(ADMIN, ivId, { dates: [] })).rejects.toThrow(/at least one session date/i);
  });

  it("rejects a blank title", async () => {
    const ivId = await interventionId("Masterclass");
    await expect(createSession(ADMIN, ivId, { title: "   " })).rejects.toThrow(/title is required/i);
  });

  it("stores the custom questions it is given on the right forms", async () => {
    const ivId = await interventionId("Masterclass");
    const intake = [{ id: "q1", label: "Venture name", type: "text", required: false }];
    const feedback = [{ id: "q2", label: "Confidence", type: "rating", required: true }];
    const sid = (await createSession(ADMIN, ivId, { intake, feedback })).rows[0].id;
    const r = await query<{ kind: string; questions: unknown }>(
      "select kind, questions from forms where session_id = $1 order by kind",
      [sid],
    );
    const byKind = Object.fromEntries(r.rows.map((x) => [x.kind, x.questions]));
    expect(byKind.intake).toEqual(intake);
    expect(byKind.feedback).toEqual(feedback);
    expect(byKind.attendance).toEqual([]);
  });

  it("pillar staff cannot create a session in another pillar", async () => {
    const ivId = await interventionId("Public Sector Fellowship");
    await expect(createSession(HENT_STAFF, ivId)).rejects.toThrow(/not allowed|permission|row-level/i);
  });

  it("pillar staff can create a session in their own pillar", async () => {
    const r = await createSession(HENT_STAFF, await interventionId("Masterclass"), { title: "Staff-created" });
    expect(r.rows[0].id).toBeTruthy();
  });

  it("the SQL initials function matches the TypeScript one for every intervention", async () => {
    const rows = await query<{ name: string; sql: string }>(
      "select name, public.intervention_initials(name) as sql from interventions",
    );
    expect(rows.rows.length).toBe(17);
    for (const r of rows.rows) {
      expect(r.sql, r.name).toBe(interventionInitials(r.name));
    }
  });
});
