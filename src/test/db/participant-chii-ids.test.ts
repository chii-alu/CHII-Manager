// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { setupDb } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await setupDb();
});

describe("participant IDs are CHII IDs", () => {
  it("a new participant gets a CHII ID", async () => {
    const r = await db.query<{ pid: string }>("insert into participants (name, email) values ('New Person', 'new.person@example.org') returning pid");
    expect(r.rows[0].pid).toMatch(/^CHII-\d{6}$/);
  });

  it("an existing participant takes the CHII ID of the person with the same email", async () => {
    await db.exec("insert into participants (pid, name, email) values ('MELA-9001', 'Old Person', 'old.person@example.org')");
    await db.exec(`
      do $$
      declare r record;
      begin
        for r in select p.id, p.name, p.email::text as email from public.participants p where p.pid like 'MELA-%' loop
          update public.participants
          set pid = (public.resolve_beneficiary(coalesce(nullif(trim(r.name), ''), r.email), r.email, null, null, 'student', '{}'::jsonb) ->> 'chii_id')
          where id = r.id;
        end loop;
      end
      $$;
    `);
    const r = await db.query<{ pid: string }>("select pid from participants where email = 'old.person@example.org'");
    expect(r.rows[0].pid).toMatch(/^CHII-\d{6}$/);
    const identity = await db.query<{ chii_id: string }>("select chii_id from beneficiary_identity where email = 'old.person@example.org'");
    expect(r.rows[0].pid).toBe(identity.rows[0].chii_id);
  });
});
