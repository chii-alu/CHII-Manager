import type { SupabaseClient } from "@supabase/supabase-js";

export type ExportEntry = {
  exportKind: "workbook" | "registry" | "table";
  pillar: string | null;
  detail: string;
  filters: Record<string, string | null>;
  rowCount: number;
  includesRestricted: boolean;
  fileName: string;
};

// Records one export. Writes only the signed-in person's own entry (row security enforces it).
export async function logExport(supabase: SupabaseClient, entry: ExportEntry) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("export_log").insert({
    user_id: user.id,
    export_kind: entry.exportKind,
    pillar: entry.pillar,
    detail: entry.detail,
    filters: entry.filters,
    row_count: entry.rowCount,
    includes_restricted: entry.includesRestricted,
    file_name: entry.fileName,
  });
  if (error) console.error("export log failed", error);
}
