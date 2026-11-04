import { ArrowRight, ClipboardCheck, FileText, Fingerprint, UserCheck } from "lucide-react";
import { signIn } from "@/app/login/actions";

const messages: Record<string, string> = {
  invalid: "That email and password did not match a MELA staff account.",
  "no-access": "This account is signed in but has no MELA staff role. Ask an admin to add you.",
  portal: "Your account does not have access to that view. Choose a view you belong to.",
  choose: "Choose a programme before signing in.",
};

// The programme choices, in the order they appear in the dropdown.
const PROGRAMMES = [
  { id: "admin", label: "Admin" },
  { id: "hent", label: "HENT" },
  { id: "hemp", label: "HEMP" },
  { id: "heco", label: "HECO" },
];

// What the platform does: the four capabilities shown on the sign-in page.
const CAPABILITIES = [
  { icon: FileText, title: "Smart Forms", body: "Create registration, application and feedback forms for every session." },
  { icon: ClipboardCheck, title: "Fair Selection", body: "Review, score and select applicants with ease." },
  { icon: UserCheck, title: "Live Attendance", body: "Mark who showed up, session by session." },
  { icon: Fingerprint, title: "One ID, Full Journey", body: "Follow each person across every program, counted only once." },
];

const PARTNERS = [
  { src: "/logos/alu.png", alt: "African Leadership University" },
  { src: "/logos/ahc.jpg", alt: "Africa Health Collaborative" },
  { src: "/logos/mcf.png", alt: "Mastercard Foundation" },
];

const FIELD =
  "h-9 w-full rounded-[6px] border border-line-strong bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/10";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div
        className="flex w-full max-w-[55rem] flex-col overflow-hidden rounded-[14px] border border-[#E3E0DA] bg-surface lg:flex-row"
        style={{ maxHeight: "620px", boxShadow: "0 8px 32px rgba(20,48,107,0.10), 0 1px 2px rgba(0,0,0,0.02)" }}
      >
        {/* Form panel */}
        <div className="flex w-full flex-col justify-between px-11 py-8 lg:w-1/2">
          <div className="mx-auto w-full max-w-[19rem]">
            <h1 className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.015em] text-ink">Welcome Back</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">Please sign in to access the Intervention Manager</p>

            {error && messages[error] && (
              <p role="alert" className="mt-5 rounded-md bg-bad-soft p-3 text-sm text-bad-ink">
                {messages[error]}
              </p>
            )}

            <form action={signIn} className="mt-6">
              <input type="hidden" name="next" value={next && next !== "/manage" ? next : ""} />

              <fieldset className="mb-3.5">
                <legend className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Programme</legend>
                <div className="grid grid-cols-2 gap-2">
                  {PROGRAMMES.map((p) => (
                    <label key={p.id} className="cursor-pointer">
                      <input type="radio" name="portal" value={p.id} required className="peer sr-only" />
                      <span className="flex h-10 items-center justify-center rounded-[6px] border border-line-strong bg-surface text-sm font-semibold text-ink hover:border-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/20">
                        {p.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mb-3.5">
                <label htmlFor="email" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-faint">
                  Email address
                </label>
                <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@chii.alu.edu" className={FIELD} />
              </div>

              <div className="mb-4">
                <label htmlFor="password" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-faint">
                  Password
                </label>
                <input id="password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••" className={FIELD} />
              </div>

              <button
                type="submit"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border-0 bg-accent text-[13px] font-bold tracking-[0.01em] text-on-accent shadow-sm hover:bg-accent-hover hover:shadow-md"
              >
                Sign in <ArrowRight size={18} aria-hidden />
              </button>
            </form>

            <p className="mt-4 text-center text-[13px] text-muted">Need access? Contact your programme lead</p>

            <div className="mt-4 border-t border-[#E3E0DA] pt-3.5">
              <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-faint">In partnership with</p>
              <div className="flex items-center justify-center gap-8">
                {PARTNERS.map((p) => (
                  <img key={p.src} src={p.src} alt={p.alt} className="chii-partner-logo block h-12 w-auto object-contain" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Brand panel */}
        <div className="flex w-full flex-col justify-between overflow-hidden bg-brand px-12 py-10 lg:w-1/2">
          <img src="/logos/CHII-Logo.png" alt="Centre for Health Innovation and Impact" className="mb-7 block h-10 w-auto flex-shrink-0 object-contain" />

          <p className="mb-8 max-w-[340px] text-[15px] font-medium leading-[1.8] text-surface">
            Manage every CHII intervention in one place, from sign-up to feedback. Track each young person across HEMP, HENT and HECO with one CHII ID, and build reliable data for health innovation across Africa.
          </p>

          <div className="mb-6">
            <p className="mb-5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/50">Platform Capabilities</p>
            <ul className="flex max-w-[340px] list-none flex-col gap-[18px] p-0">
              {CAPABILITIES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <div className="mt-px flex h-8 w-8 min-w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.08]">
                    <Icon size={16} color="white" strokeWidth={1.5} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-0.5 text-[13px] font-semibold leading-[1.3] text-surface">{title}</p>
                    <p className="text-[12.5px] leading-normal text-on-accent-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="flex-shrink-0 text-[11px] text-white/60">© 2026 CHII · African Leadership University</p>
        </div>
      </div>
    </main>
  );
}
