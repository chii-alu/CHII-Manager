// A number with its label. Numbers use tabular figures so columns line up.
export function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-semibold tabular-nums text-[#102C5E]">{value}</div>
      <div className="text-xs text-[#5E6C84]">{label}</div>
    </div>
  );
}
