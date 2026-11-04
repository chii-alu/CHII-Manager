import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { todayIso } from "@/lib/dates";
import { PORTALS } from "@/lib/auth/portals";

export const runtime = "nodejs";

// The three registries (WORKBOOKS-AND-FLEXIBLE-FIELDS §5). Each row is limited by row security for the signed-in person.
const REGISTRIES = {
  participants: {
    view: "v_participant_registry",
    columns: ["chii_id", "full_name", "email", "student_email", "cohort", "intervention", "pillar", "participation_status", "registered_on", "application_status", "sessions_attended", "sessions_total"],
  },
  attendance: {
    view: "v_attendance_registry",
    columns: ["chii_id", "full_name", "email", "cohort", "intervention", "pillar", "session_date", "session_title", "checked_in_at", "method"],
  },
  feedback: {
    view: "v_feedback_registry",
    columns: ["chii_id", "full_name", "email", "cohort", "intervention", "pillar", "submitted_at", "satisfaction", "relevance", "nps", "most_useful", "improve"],
  },
} as const;

type RegistryName = keyof typeof REGISTRIES;

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!(name in REGISTRIES)) return NextResponse.json({ error: "Unknown registry" }, { status: 404 });
  const registry = REGISTRIES[name as RegistryName];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: staff } = await supabase.from("staff_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (!staff) return NextResponse.json({ error: "Only MELA staff can export registries" }, { status: 403 });

  // Optional filter: ?pillar=HENT (or any of the portal names). The database still applies access rules.
  const search = request.nextUrl.searchParams;
  const portal = search.get("portal");
  let query = supabase.from(registry.view).select(registry.columns.join(", "));
  if (portal && (PORTALS as readonly string[]).includes(portal) && portal !== "admin") {
    query = query.eq("pillar", portal.toUpperCase());
  }
  const intervention = search.get("intervention");
  const cohort = search.get("cohort");
  if (intervention) query = query.eq("intervention", intervention);
  if (cohort) query = query.eq("cohort", cohort);
  const { data, error } = await query.order("pillar").limit(50000);
  if (error) {
    console.error("registry export failed", name, error);
    return NextResponse.json({ error: "The registry could not be exported." }, { status: 500 });
  }

  const csv = toCsv([...registry.columns], (data ?? []) as unknown as Record<string, unknown>[]);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="mela-${name}-registry-${todayIso()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
