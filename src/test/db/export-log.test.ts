// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN, HENT_STAFF, asUser, setupDb } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await setupDb();
});

describe("export log", () => {
  it("staff record their own exports", async () => {
    await asUser(db, HENT_STAFF, "insert into export_log (user_id, export_kind, pillar, detail, row_count, includes_restricted, file_name) values (auth.uid(), 'workbook', 'HENT', 'participants', 3, false, 'HENT Consolidated Participants - de-identified.xlsx')");
    const r = await asUser(db, HENT_STAFF, "select count(*)::int n from export_log");
    expect(r.rows[0].n).toBe(0);
  });

  it("nobody can record an export for another person", async () => {
    await expect(
      asUser(db, HENT_STAFF, "insert into export_log (user_id, export_kind, detail, row_count, includes_restricted, file_name) values ('00000000-0000-0000-0000-00000000000a', 'table', 'participants', 1, true, 'x.csv')"),
    ).rejects.toThrow(/row-level security/);
  });

  it("only admins read the log, and entries cannot be changed", async () => {
    await asUser(db, ADMIN, "insert into export_log (user_id, export_kind, detail, row_count, includes_restricted, file_name) values (auth.uid(), 'table', 'participants', 5, true, 'mela-participants.csv')");
    const admin = await asUser(db, ADMIN, "select count(*)::int n from export_log");
    expect(admin.rows[0].n).toBeGreaterThan(0);
    await expect(asUser(db, ADMIN, "update export_log set row_count = 0")).rejects.toThrow(/permission denied/);
    await expect(asUser(db, ADMIN, "delete from export_log")).rejects.toThrow(/permission denied/);
  });
});
