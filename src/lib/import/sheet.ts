import ExcelJS from "exceljs";
import { parseCsv } from "./csv";
import type { Target } from "./plan";

// The person fields a sheet can be mapped to.
export const PERSON_TARGETS: Target[] = [
  { key: "email", label: "Email", aliases: ["Email address", "Personal email address"] },
  { key: "student_email", label: "Student email", aliases: ["Student email address"] },
  { key: "full_name", label: "Names", aliases: ["Full name", "Name"] },
  { key: "phone", label: "Phone", aliases: ["Phone number", "WhatsApp"] },
  { key: "gender", label: "Gender" },
  { key: "gender_identity", label: "Gender Identity" },
  { key: "nationality", label: "Nationality" },
  { key: "birth_country", label: "Country of Birth", aliases: ["Birth country"] },
  { key: "residence_country", label: "Country of Residence", aliases: ["Country of residence"] },
  { key: "residence_city", label: "City of Residence", aliases: ["City"] },
  { key: "student_id", label: "Student ID" },
  { key: "humanitarian_status", label: "Has Humanitarian Status" },
  { key: "disability_status", label: "Disability Status", aliases: ["Disability"] },
  { key: "enrolment_status", label: "Enrollment Status", aliases: ["Enrolment status"] },
  { key: "year_group", label: "Year Group" },
  { key: "academic_programme", label: "Primary Academic Program", aliases: ["Programme", "Program"] },
  { key: "consent", label: "Consent", aliases: ["Consent given"] },
];

// Reads the first sheet of an XLSX file, or a CSV file, into rows of text cells.
export async function readSheet(file: File): Promise<string[][]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];
    const rows: string[][] = [];
    sheet?.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text ?? "");
      rows.push(cells);
    });
    return rows;
  }
  return parseCsv(buffer.toString("utf8"));
}
