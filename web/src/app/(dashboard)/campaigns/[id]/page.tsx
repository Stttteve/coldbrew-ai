import { notFound } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CampaignWorkspace } from "@/components/campaign/campaign-workspace";
import { ProjectNameHeader } from "@/components/campaign/project-name-header";
import { recipientToClientJson } from "@/lib/campaigns/recipient-json";
import type { Briefing } from "@/lib/llm/schemas";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const userId = session!.user!.id;

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      recipients: {
        orderBy: { createdAt: "asc" },
      },
      sendingProviderAccount: {
        select: {
          id: true,
          providerUserEmail: true,
          status: true,
        },
      },
    },
  });
  if (!campaign || campaign.userId !== userId) notFound();

  const providers = await prisma.providerAccount.findMany({
    where: { userId, status: "active" },
    select: { id: true, providerUserEmail: true, provider: true },
    orderBy: { createdAt: "asc" },
  });

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultSignature: true, resumeFileName: true },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <ProjectNameHeader projectId={campaign.id} initialName={campaign.name} />
        <p className="text-sm text-muted-foreground">
          Status:{" "}
          <span className="uppercase tracking-wide">{campaign.status}</span>
          {campaign.purposeCategory
            ? ` · ${campaign.purposeCategory.replace(/_/g, " ")}`
            : ""}
        </p>
      </div>

      {providers.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-900">
          <b>Heads up:</b> no Gmail connected yet. You can still chat, add
          recipients, and generate + review drafts here — you&apos;ll just
          need to connect an inbox in{" "}
          <a href="/settings" className="font-medium underline">
            Settings
          </a>{" "}
          before you can push the drafts into Gmail.
        </div>
      ) : null}

      <CampaignWorkspace
        project={{
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          briefing: campaign.briefing as unknown as Briefing | null,
          sendingProviderAccountId: campaign.sendingProviderAccountId,
          attachResume: campaign.attachResume,
        }}
        defaultSignature={me?.defaultSignature ?? null}
        hasResume={Boolean(me?.resumeFileName)}
        providers={providers}
        recipients={campaign.recipients.map(recipientToClientJson)}
      />
    </div>
  );
}
