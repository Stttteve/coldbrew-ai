import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConnectGmailSection } from "@/components/settings/connect-gmail-section";
import { ResumeSection } from "@/components/settings/resume-section";
import { SignatureSection } from "@/components/settings/signature-section";
import { DangerZone } from "@/components/settings/danger-zone";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { gmail_connected?: string; gmail_connect_error?: string };
}) {
  const session = await auth();
  const userId = session!.user!.id;

  const [accounts, user] = await Promise.all([
    prisma.providerAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        provider: true,
        providerUserEmail: true,
        scopes: true,
        status: true,
        tokenExpiresAt: true,
        createdAt: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        defaultSignature: true,
        defaultLinks: true,
        resumeFileName: true,
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Connected inboxes, defaults, and account controls.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected email accounts</CardTitle>
          <CardDescription>
            Coldbrew creates drafts inside these inboxes using OAuth. You send
            them manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectGmailSection
            accounts={accounts}
            connectedEmail={searchParams.gmail_connected}
            errorCode={searchParams.gmail_connect_error}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your defaults</CardTitle>
          <CardDescription>
            Used to personalise every draft.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignatureSection
            initialName={user?.name ?? null}
            initialSignature={user?.defaultSignature ?? null}
            initialLinks={
              (user?.defaultLinks as
                | { cv?: string; github?: string; portfolio?: string }
                | null) ?? null
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resume</CardTitle>
          <CardDescription>
            Attach to outreach when you enable it on a project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResumeSection initialFileName={user?.resumeFileName ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Signed in as <code>{session!.user!.email}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DangerZone />
        </CardContent>
      </Card>
    </div>
  );
}
