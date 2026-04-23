import type { ReactNode } from "react";
import Link from "next/link";

export const metadata = { title: "Pricing — Coldbrew AI" };

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-amber-50/40">
      <nav className="container flex h-16 items-center justify-between border-b border-amber-100/80 bg-white/60 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="text-xl">☕</span>
          Coldbrew AI
        </Link>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup" variant="accent">
            Get started
          </ButtonLink>
        </div>
      </nav>

      <div className="container max-w-3xl space-y-12 px-4 py-14">
        <header className="space-y-3 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">
            Pricing guide
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Simple plans for outreach teams
          </h1>
          <p className="text-muted-foreground">
            Coldbrew is in <b>private beta</b>. There is no paid checkout yet — the
            numbers below are the <b>product direction</b> we&apos;re building toward.
            During beta, accounts are free within fair-use limits.
          </p>
        </header>

        <p className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <b>Not legal or tax advice.</b> Final terms, taxes, and invoicing will
          ship with checkout. Until then, treat this page as a roadmap for how we
          think about value and metering.
        </p>

        <section id="plans" className="scroll-mt-24 space-y-6">
          <h2 className="text-xl font-semibold tracking-tight">Plans at a glance</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <PlanCard
              name="Beta (today)"
              price="$0"
              period="while in beta"
              highlight
              bullets={[
                "Briefing chat + summary",
                "Recipients (paste / CSV / manual)",
                "AI drafts + Gmail draft or send",
                "1 connected Gmail per user (typical)",
                "~10 AI draft generations / month (soft cap)",
              ]}
            />
            <PlanCard
              name="Solo"
              price="$29"
              period="/ month (planned)"
              bullets={[
                "Everything in beta, higher limits",
                "Priority email support",
                "Roughly 200 drafts / month (TBD)",
                "Export & audit log retention",
              ]}
            />
            <PlanCard
              name="Team"
              price="$99+"
              period="/ month (planned)"
              bullets={[
                "Multiple seats + shared templates",
                "Central billing & SSO (later)",
                "Higher caps + queue workers",
                "Contact us for volume",
              ]}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">What we meter</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <b className="text-foreground">AI draft generations</b> — each time you
              run batch or single-recipient generation we call the LLM. Regenerations
              count too (small cost adds up).
            </li>
            <li>
              <b className="text-foreground">Enrichment lookups</b> — optional
              third-party calls (e.g. title / org hints). Free tier may cap calls per
              recipient.
            </li>
            <li>
              <b className="text-foreground">Gmail actions</b> — saving drafts and
              sending mail use your Google quota; we don&apos;t charge per message,
              but bulk sends must stay within Gmail&apos;s own limits.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Fair use during beta</h2>
          <p className="text-sm text-muted-foreground">
            We may throttle or pause accounts that hammer the API (e.g. thousands of
            regenerations per hour) so the service stays fast for everyone. If you
            need a higher ceiling for a real campaign, email us — we&apos;d rather
            understand the use case than hard-block you.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">FAQ</h2>
          <dl className="space-y-4 text-sm">
            <Faq q="When will you charge a card?">
              After we ship Stripe (or similar) checkout and publish final Terms of
              Service. You&apos;ll get notice before any charge.
            </Faq>
            <Faq q="Can I cancel anytime?">
              Yes. Paid plans will be month-to-month unless you choose annual billing
              for a discount (planned).
            </Faq>
            <Faq q="Do you read my Gmail inbox?">
              No. We only request scopes needed to create drafts / send messages you
              explicitly trigger. See the{" "}
              <Link href="/privacy" className="underline">
                privacy policy
              </Link>
              .
            </Faq>
            <Faq q="Nonprofits or students?">
              We want to support good outreach, not spam. Tell us your story — we
              may offer credits or discounts case by case during beta.
            </Faq>
          </dl>
        </section>

        <footer className="flex flex-col gap-3 border-t pt-8 sm:flex-row sm:items-center sm:justify-between">
          <ButtonLink href="/signup" variant="accent">
            Create a free account
          </ButtonLink>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← Back to home
          </Link>
        </footer>
      </div>
    </main>
  );
}

function ButtonLink({
  href,
  children,
  variant,
}: {
  href: string;
  children: ReactNode;
  variant: "accent" | "ghost";
}) {
  const cls =
    variant === "accent"
      ? "inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
      : "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium hover:bg-muted";
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

function PlanCard({
  name,
  price,
  period,
  bullets,
  highlight,
}: {
  name: string;
  price: string;
  period: string;
  bullets: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${
        highlight
          ? "border-amber-400 bg-white ring-2 ring-amber-200/80"
          : "border-border/80 bg-white/80"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {name}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold">{price}</span>
        <span className="text-xs text-muted-foreground">{period}</span>
      </div>
      <ul className="mt-4 list-inside list-disc space-y-1.5 text-xs text-muted-foreground">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{q}</dt>
      <dd className="mt-1 text-muted-foreground">{children}</dd>
    </div>
  );
}
