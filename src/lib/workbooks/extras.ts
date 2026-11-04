// Extra columns for a workbook: every question answered that the fixed columns do not already cover.
// They are appended after the fixed columns, in the order they were first answered.

export type ExtraAnswer = { responseId: string; fieldKey: string; value: string | null };

export type Extras = {
  // Column keys in first-used order, e.g. "extra_venture_stage".
  keys: string[];
  // Column key -> label, from the field dictionary (or the key when there is none).
  labels: Map<string, string>;
  // Response id -> column key -> value.
  byResponse: Map<string, Record<string, string>>;
};

export function buildExtras(answers: ExtraAnswer[], fixedKeys: Set<string>, labelFor: Map<string, string>): Extras {
  const keys: string[] = [];
  const labels = new Map<string, string>();
  const byResponse = new Map<string, Record<string, string>>();
  for (const a of answers) {
    if (fixedKeys.has(a.fieldKey) || a.value === null || a.value === "") continue;
    const key = `extra_${a.fieldKey}`;
    if (!labels.has(key)) {
      keys.push(key);
      labels.set(key, labelFor.get(a.fieldKey) ?? a.fieldKey);
    }
    const row = byResponse.get(a.responseId) ?? {};
    row[key] = a.value;
    byResponse.set(a.responseId, row);
  }
  return { keys, labels, byResponse };
}

// The value of a response_value row, as text.
export function answerText(row: { value_text: string | null; value_number: number | null; value_json: unknown }): string | null {
  if (row.value_text !== null && row.value_text !== undefined) return row.value_text;
  if (row.value_number !== null && row.value_number !== undefined) return String(row.value_number);
  if (row.value_json !== null && row.value_json !== undefined) {
    return Array.isArray(row.value_json) ? row.value_json.join("; ") : JSON.stringify(row.value_json);
  }
  return null;
}
