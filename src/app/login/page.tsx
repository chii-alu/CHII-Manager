import { redirect } from "next/navigation";

// The sign-in page is the front page now. Older links to /login go there, keeping their query string.
export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (value !== undefined) query.set(key, value);
  }
  const qs = query.toString();
  redirect(qs ? `/?${qs}` : "/");
}
