// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN, asAnon, asUser, setupDb } from "./harness";

let db: PGlite;

async function ivId(name: string) {
  return (await db.query<{ id: string }>("select id from interventions where name = $1", [name])).rows[0].id;
}

// Creates a session with forms open. Returns the codes.
async function openSession(name: string, opts: { kind?: "open" | "selective"; capacity?: number | null; dates?: string[]; deadline?: string | null } = {}) {
  const id = await ivId(name);
  const rubric = opts.kind === "selective" ? JSON.stringify([{ name: "Impact", weight: 100 }]) : null;
  const r = await asUser(
    db,
    ADMIN,
    `select public.create_session($1, 'T', $2::date[], 'Online', null, null, $3, $4, '[]', '[]', $5::jsonb) as id`,
    [id, opts.dates ?? ["2026-11-12", "2026-11-13"], opts.capacity ?? null, opts.deadline ?? null, rubric],
  );
  const sid = r.rows[0].id;
  // Forms start as drafts; staff open them. Done as the table owner to keep the test focused.
  await db.exec(`update forms set status = 'open' where session_id = '${sid}'`);
  const codes = await db.query<{ kind: string; code: string }>("select kind, code from forms where session_id = $1", [sid]);
  return { sid, codes: Object.fromEntries(codes.rows.map((c) => [c.kind, c.code])) };
}

const profile = (email: string, name = "Test Person") => ({
  name,
  email,
  phone: "+250 780000000",
  gender: "Female",
  age: "18–24",
  country: "Rwanda",
  affiliation: "Student",
  disability: "No",
  consent: "yes",
});

const submitIntake = (code: string, p: object, answers: object = {}) =>
  asAnon(db, "select public.submit_intake($1, $2::jsonb, $3::jsonb) as r", [code, JSON.stringify(p), JSON.stringify(answers)]);

beforeAll(async () => {
  db = await setupDb();
});

describe("get_public_form", () => {
  it("returns the form, its session and pillar for a known code", async () => {
    const { codes } = await openSession("Masterclass");
    const r = await asAnon(db, "select public.get_public_form($1) as f", [codes.intake]);
    const f = r.rows[0].f as { kind: string; status: string; pillar: string; session: { title: string } };
    expect(f.kind).toBe("intake");
    expect(f.status).toBe("open");
    expect(f.pillar).toBe("HENT");
    expect(f.session.title).toBe("T");
  });

  it("returns null for an unknown code", async () => {
    const r = await asAnon(db, "select public.get_public_form('NOPE') as f");
    expect(r.rows[0].f).toBeNull();
  });
});

describe("submit_intake (SPEC §4.5–4.9)", () => {
  it("registers a new participant and gives a PID", async () => {
    const { codes } = await openSession("Masterclass");
    const r = await submitIntake(codes.intake, profile("new@example.org"));
    expect(r.rows[0].r).toMatchObject({ status: "registered", returning: false });
    expect(r.rows[0].r.pid).toMatch(/^CHII-\d{6}$/);
  });

  it("matches a returning email case-insensitively and reuses the PID", async () => {
    const a = await openSession("Masterclass");
    const b = await openSession("Masterclass");
    const first = (await submitIntake(a.codes.intake, profile("Same@Example.org"))).rows[0].r;
    const second = (await submitIntake(b.codes.intake, profile("same@example.ORG", "Changed Name"))).rows[0].r;
    expect(second.pid).toBe(first.pid);
    expect(second.returning).toBe(true);
    const count = await db.query<{ n: number }>("select count(*)::int n from participants where email = 'same@example.org'");
    expect(count.rows[0].n).toBe(1);
  });

  it("rejects a second entry for the same session with a friendly message", async () => {
    const { codes } = await openSession("Masterclass");
    await submitIntake(codes.intake, profile("dup@example.org"));
    await expect(submitIntake(codes.intake, profile("DUP@example.org"))).rejects.toThrow(/already registered/);
  });

  it("wait-lists registrations once capacity is reached", async () => {
    const { codes } = await openSession("Masterclass", { capacity: 2 });
    const statuses: string[] = [];
    for (const e of ["a@x.org", "b@x.org", "c@x.org"]) {
      statuses.push((await submitIntake(codes.intake, profile(e))).rows[0].r.status);
    }
    expect(statuses).toEqual(["registered", "registered", "waitlisted"]);
  });

  it("always lands selective applications as applied", async () => {
    const { codes } = await openSession("Venture Funding", { kind: "selective" });
    const r = await submitIntake(codes.intake, profile("app@example.org"), { motivation: "x" });
    expect(r.rows[0].r.status).toBe("applied");
  });

  it("rejects applications after the deadline", async () => {
    const { codes } = await openSession("Venture Funding", { kind: "selective", deadline: "2000-01-01" });
    await expect(submitIntake(codes.intake, profile("late@example.org"))).rejects.toThrow(/Applications closed/);
  });

  it("refuses submissions when the form is not open", async () => {
    const { sid, codes } = await openSession("Masterclass");
    await db.exec(`update forms set status = 'closed' where session_id = '${sid}' and kind = 'intake'`);
    await expect(submitIntake(codes.intake, profile("closed@example.org"))).rejects.toThrow(/not accepting responses/);
  });

  it("requires consent and a name", async () => {
    const { codes } = await openSession("Masterclass");
    await expect(submitIntake(codes.intake, { ...profile("c@example.org"), consent: "no" })).rejects.toThrow(/Consent/);
    await expect(submitIntake(codes.intake, { ...profile("d@example.org"), name: " " })).rejects.toThrow(/required/);
  });
});

describe("submit_checkin (SPEC §4.10)", () => {
  const checkin = (code: string, email: string, date: string) =>
    asAnon(db, "select public.submit_checkin($1, $2, $3::date) as r", [code, email, date]);

  it("checks in a registered participant on a session date", async () => {
    const { codes } = await openSession("Masterclass");
    await submitIntake(codes.intake, profile("in@example.org"));
    const r = await checkin(codes.attendance, "in@example.org", "2026-11-12");
    expect(r.rows[0].r.date).toBe("2026-11-12");
  });

  it("rejects an email that is not registered for the session", async () => {
    const { codes } = await openSession("Masterclass");
    await expect(checkin(codes.attendance, "nobody@example.org", "2026-11-12")).rejects.toThrow(/No participant found/);
  });

  it("rejects a date that is not a session date", async () => {
    const { codes } = await openSession("Masterclass");
    await submitIntake(codes.intake, profile("date@example.org"));
    await expect(checkin(codes.attendance, "date@example.org", "2026-12-25")).rejects.toThrow(/session dates/);
  });

  it("rejects a duplicate check-in on the same day", async () => {
    const { codes } = await openSession("Masterclass");
    await submitIntake(codes.intake, profile("twice@example.org"));
    await checkin(codes.attendance, "twice@example.org", "2026-11-12");
    await expect(checkin(codes.attendance, "twice@example.org", "2026-11-12")).rejects.toThrow(/already checked in/);
    // A different date is allowed.
    await expect(checkin(codes.attendance, "twice@example.org", "2026-11-13")).resolves.toBeDefined();
  });

  it("only selected applicants can check in to a selective session", async () => {
    const { codes } = await openSession("Venture Funding", { kind: "selective" });
    await submitIntake(codes.intake, profile("pending@example.org"));
    await expect(checkin(codes.attendance, "pending@example.org", "2026-11-12")).rejects.toThrow(/not on the list/);
    await db.exec(`update entries set status = 'selected' where session_id = '${(await db.query<{ sid: string }>("select session_id as sid from forms where code = $1", [codes.attendance])).rows[0].sid}'`);
    await expect(checkin(codes.attendance, "pending@example.org", "2026-11-12")).resolves.toBeDefined();
  });
});

describe("submit_feedback (SPEC §4.12)", () => {
  const feedback = (code: string, email: string, sat = 4, rel = 5, nps = 9) =>
    asAnon(db, "select public.submit_feedback($1, $2, $3, $4, $5, 'great', null, '{}'::jsonb) as r", [code, email, sat, rel, nps]);

  it("needs an attendance record first", async () => {
    const { codes } = await openSession("Masterclass");
    await submitIntake(codes.intake, profile("nofb@example.org"));
    await expect(feedback(codes.feedback, "nofb@example.org")).rejects.toThrow(/no attendance record/);
  });

  it("accepts feedback once after attendance, then refuses a second response", async () => {
    const { codes } = await openSession("Masterclass");
    await submitIntake(codes.intake, profile("fb@example.org"));
    await asAnon(db, "select public.submit_checkin($1, 'fb@example.org', '2026-11-12'::date)", [codes.attendance]);
    await expect(feedback(codes.feedback, "fb@example.org")).resolves.toBeDefined();
    await expect(feedback(codes.feedback, "fb@example.org")).rejects.toThrow(/already been recorded/);
  });
});

describe("public access", () => {
  it("anon cannot read the tables directly", async () => {
    // Policies grant anon nothing, so the rows are invisible rather than readable.
    const r = await asAnon(db, "select count(*)::int n from participants");
    expect(r.rows[0].n).toBe(0);
  });
});
