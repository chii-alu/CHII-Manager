import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StaffAdmin, type StaffRow } from "@/components/manage/StaffAdmin";
import { PageBand } from "@/components/ui/page-band";

// Admin only (SPEC §8). The list comes from a database function that checks the caller is an admin.
export default async function StaffPage({ params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  // Staff access belongs to the admin portal only.
  if (portal !== "admin") notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_staff");
  if (error) {
    if (error.code === "42501") notFound();
    throw new Error(`Could not load staff: ${error.message}`);
  }
  const rows: StaffRow[] = ((data ?? []) as { user_id: string; email: string; role: string; pillars: string[] }[]).map((r) => ({
    userId: r.user_id,
    email: r.email,
    role: r.role,
    pillars: r.pillars ?? [],
  }));

  return (
    <section className="flex flex-col gap-6">
      <PageBand title="Staff access">
        <p className="mt-2 max-w-2xl text-muted">
          Grant or change access for people who already have a Supabase account. To add someone new, create their account in Supabase Authentication first, then add them here.
        </p>
      </PageBand>
      <StaffAdmin rows={rows} />
    </section>
  );
}
