import Link from "next/link";

export const metadata = { title: "Terms of service — Coldbrew AI" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-16 text-sm leading-relaxed">
      <header className="space-y-2">
        <Link href="/" className="text-muted-foreground hover:underline">
          ← Back
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Terms of service</h1>
        <p className="text-muted-foreground">Last updated: {new Date().toISOString().slice(0, 10)}</p>
      </header>

      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
        <b>Beta notice.</b> Placeholder terms for private beta. Replace before
        commercial launch.
      </p>

      <Section title="Acceptable use">
        <ul className="list-disc space-y-1 pl-5">
          <li>Don&apos;t use Coldbrew for spam, phishing, impersonation, or harassment.</li>
          <li>Comply with CAN-SPAM / CASL / GDPR in every recipient&apos;s jurisdiction.</li>
          <li>Include an unsubscribe option and your real postal address in every outbound email.</li>
          <li>Don&apos;t scrape LinkedIn directly — use the licensed enrichment providers.</li>
        </ul>
      </Section>

      <Section title="You send, we draft">
        <p>
          Coldbrew creates drafts inside your Gmail account. You are the
          sender, and legal responsibility for the messages sent is yours.
        </p>
      </Section>

      <Section title="Service availability">
        <p>
          The service is provided &ldquo;as is&rdquo;. No warranty of uptime or results
          during beta. See the <Link href="/privacy" className="underline">privacy policy</Link> for data rights.
        </p>
      </Section>

      <Section title="Termination">
        <p>
          We may suspend accounts that violate acceptable use. You may delete
          your account at any time from the Settings page; we purge data within
          30 days.
        </p>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
