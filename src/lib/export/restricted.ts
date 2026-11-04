// Restricted columns (WORKBOOKS-AND-FLEXIBLE-FIELDS §7): personal details and standing. Only the data owner (a MELA admin)
// gets them. Everyone else gets the file without them, and the file name says so.
export const RESTRICTED_COLUMNS = new Set([
  "email",
  "student_email",
  "full_name",
  "name",
  "names",
  "phone",
  "student_id",
  "financial_standing",
  "academic_standing",
  "disciplinary_standing",
]);

export const DE_IDENTIFIED_SUFFIX = " - de-identified";

// Leaves out the restricted columns for people who may not see them. Columns are removed, not blanked.
export function allowedColumns(keys: string[], headers: string[], canSeeRestricted: boolean) {
  const kept = keys.map((k, i) => ({ k, h: headers[i] })).filter((x) => canSeeRestricted || !RESTRICTED_COLUMNS.has(x.k));
  return { keys: kept.map((x) => x.k), headers: kept.map((x) => x.h), removed: kept.length !== keys.length };
}

export function fileName(base: string, extension: string, deIdentified: boolean) {
  return `${base}${deIdentified ? DE_IDENTIFIED_SUFFIX : ""}.${extension}`;
}
