import Link from "next/link";

export const metadata = { title: "Privacy policy — Coldbrew AI" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-16 text-sm leading-relaxed">
      <header className="space-y-2">
        <Link href="/" className="text-muted-foreground hover:underline">
          ← Back
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="text-muted-foreground">Last updated: {new Date().toISOString().slice(0, 10)}</p>
      </header>

      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
        <b>Beta notice.</b> This is a placeholder policy for the private beta.
        Replace with counsel-reviewed language before public launch.
      </p>

      <Section title="What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your account email and optional name.</li>
          <li>OAuth grant details (Gmail `gmail.compose` scope). Refresh tokens are envelope-encrypted at rest.</li>
          <li>Project briefings, recipients you add, and generated drafts.</li>
          <li>Operational logs (hashed user id, request IDs) for up to 30 days.</li>
        </ul>
      </Section>

      <Section title="What we don't collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>We never read your existing inbox — the only permission we request is the ability to <i>create drafts</i>, not to read or send mail.</li>
          <li>We never log full OAuth tokens or passwords.</li>
        </ul>
      </Section>

      <Section title="Sub-processors">
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Google / Microsoft</b> — OAuth + mail APIs</li>
          <li><b>Anthropic / OpenAI</b> — LLM for drafting</li>
          <li><b>Hunter.io / Apollo.io / Proxycurl</b> — optional recipient enrichment</li>
          <li><b>Vercel / AWS / Neon / Upstash</b> — hosting, databases, queues</li>
        </ul>
      </Section>

      <Section title="Your rights">
        <p>
          You can export or delete everything we hold on you from the{" "}
          <Link href="/settings" className="underline">
            Settings page
          </Link>{" "}
          once signed in. Recipients of your outreach can request deletion of any
          enrichment data we cached about them via{" "}
          <Link href="/data-request" className="underline">
            /data-request
          </Link>
          .
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Security / privacy questions: <code>security@example.com</code>.
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
