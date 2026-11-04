import { btn, btnPri, input, label } from "@/components/ui/styles";

// Filters for a list, as a plain form: choosing Apply reloads the page with the filters in the address.
// Pillar is shown only where the list covers more than one pillar.
export function FilterBar({
  pillars,
  interventions,
  values,
}: {
  pillars?: string[];
  interventions: string[];
  values: { pillar?: string; intervention?: string; from?: string; to?: string };
}) {
  return (
    <form method="get" className="grid gap-3 rounded-[14px] border border-[#E3E8F0] bg-white p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1.4fr_170px_170px_auto] xl:items-end">
      {pillars && (
        <label className={label}>
          Pillar
          <select name="pillar" defaultValue={values.pillar ?? ""} className={input}>
            <option value="">All pillars</option>
            {pillars.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={label}>
        Intervention
        <select name="intervention" defaultValue={values.intervention ?? ""} className={input}>
          <option value="">All interventions</option>
          {interventions.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        From
        <input type="date" name="from" defaultValue={values.from ?? ""} className={input} />
      </label>
      <label className={label}>
        To
        <input type="date" name="to" defaultValue={values.to ?? ""} className={input} />
      </label>
      <div className="flex gap-2">
        <button type="submit" className={btnPri}>
          Apply
        </button>
        <a href="?" className={btn}>
          Clear
        </a>
      </div>
    </form>
  );
}
