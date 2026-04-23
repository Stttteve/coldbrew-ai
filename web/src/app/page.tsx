import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-amber-50/40 text-foreground">
      <nav className="container flex h-16 items-center justify-between">
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
      </nav>

      <section className="container flex flex-col items-center gap-8 py-24 text-center">
        <span className="rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-medium tracking-wide text-amber-900">
          Private beta — drafts only, you send.
        </span>
        <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
          Cold emails, <span className="text-amber-700">warmly brewed.</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Describe who you&apos;re writing to and why. Coldbrew researches each
          recipient and drops a genuinely personalized draft straight into your
          own Gmail — ready for one final human review.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" variant="accent" asChild>
            <Link href="/signup">Start drafting — it&apos;s free</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#how">How it works</Link>
          </Button>
        </div>
      </section>

      <section id="how" className="container grid gap-8 pb-24 md:grid-cols-3">
        {[
          {
            n: "01",
            t: "Describe the outreach",
            d: "A short chat instead of a form. Tell us who, why, and in what voice.",
          },
          {
            n: "02",
            t: "Drop in your recipients",
            d: "Paste emails, names, LinkedIn URLs, or a CSV. We research each one.",
          },
          {
            n: "03",
            t: "Review in your own inbox",
            d: "We create drafts via OAuth. You read them, tweak, then hit send yourself.",
          },
        ].map((s) => (
          <div
            key={s.n}
            className="rounded-xl border bg-white/70 p-6 shadow-sm backdrop-blur"
          >
            <div className="mb-4 text-sm font-mono text-amber-700">{s.n}</div>
            <div className="mb-2 text-lg font-semibold">{s.t}</div>
            <p className="text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
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
