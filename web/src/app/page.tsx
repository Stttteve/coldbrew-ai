import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";
import {
  ConnectGmailMockup,
  RecipientsMockup,
  DraftingMockup,
  DashboardMockup,
} from "@/components/landing/mockups";

const SECTIONS = [
  {
    eyebrow: "Step 01",
    title: "Connect your Gmail in one click.",
    body: "OAuth only — we never see your password. Coldbrew creates drafts inside your own inbox so nothing ever leaves your account without you hitting send.",
    Mock: ConnectGmailMockup,
  },
  {
    eyebrow: "Step 02",
    title: "Drop in recipients. We research each one.",
    body: "Paste emails, names, or a CSV. Coldbrew pulls public context — role, recent work, mutuals — so every draft starts from something real, not a template.",
    Mock: RecipientsMockup,
  },
  {
    eyebrow: "Step 03",
    title: "AI drafts in your voice, grounded in context.",
    body: "Tell us who you are and why you're reaching out. Each draft reads like you wrote it on a good morning — specific, warm, not obviously generated.",
    Mock: DraftingMockup,
  },
  {
    eyebrow: "Step 04",
    title: "Review in your own inbox. You send.",
    body: "Drafts land in Gmail alongside your normal workflow. Tweak, send, track replies from a simple dashboard. No autonomous sending, ever.",
    Mock: DashboardMockup,
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-amber-50/40 text-foreground">
      <nav className="sticky top-0 z-40 border-b border-amber-100/60 bg-white/70 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl">☕</span>
            <span className="font-semibold tracking-tight">Coldbrew AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/pricing">Pricing</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button variant="accent" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </nav>

      <section className="container flex flex-col items-center gap-8 py-28 text-center md:py-36">
        <Reveal>
          <span className="rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-medium tracking-wide text-amber-900">
            Private beta — drafts only, you send.
          </span>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
            Cold emails,{" "}
            <span className="text-amber-700">warmly brewed.</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Describe who you&apos;re writing to and why. Coldbrew researches
            each recipient and drops a genuinely personalized draft into your
            Gmail — ready for one final human review.
          </p>
        </Reveal>
        <Reveal delay={240}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" variant="accent" asChild>
              <Link href="/signup">Start drafting — it&apos;s free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#how">See how it works</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      <div id="how" className="container space-y-28 pb-32 md:space-y-40">
        {SECTIONS.map((s, i) => {
          const reverse = i % 2 === 1;
          return (
            <section
              key={s.title}
              className={`grid items-center gap-10 md:grid-cols-2 md:gap-16 ${
                reverse ? "md:[&>div:first-child]:order-2" : ""
              }`}
            >
              <Reveal>
                <div>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    {s.eyebrow}
                  </div>
                  <h2 className="mb-5 text-balance text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
                    {s.title}
                  </h2>
                  <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <s.Mock />
              </Reveal>
            </section>
          );
        })}
      </div>

      <section className="container pb-28">
        <Reveal>
          <div className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-100 via-white to-amber-50 p-10 text-center shadow-sm md:p-16">
            <h2 className="mb-4 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Warm up your outreach this week.
            </h2>
            <p className="mx-auto mb-7 max-w-xl text-muted-foreground">
              Free during private beta. You keep control of every send.
            </p>
            <Button size="lg" variant="accent" asChild>
              <Link href="/signup">Get started — it&apos;s free</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      <footer className="container flex flex-col items-center justify-between gap-4 border-t py-8 text-sm text-muted-foreground md:flex-row">
        <div>© {new Date().getFullYear()} Coldbrew AI</div>
        <div className="flex gap-6">
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <a
            href="mailto:security@example.com"
            className="hover:text-foreground"
          >
            security@
          </a>
        </div>
      </footer>
    </main>
  );
}
