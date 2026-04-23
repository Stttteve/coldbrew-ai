import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CampaignsList } from "@/components/campaign/campaigns-list";
import { NewProjectButton } from "@/components/campaign/new-project-button";

export default async function CampaignsListPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const campaigns = await prisma.campaign.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      purposeCategory: true,
      updatedAt: true,
      _count: { select: { recipients: true } },
    },
  });

  return (
    <div id="projects" className="mx-auto max-w-4xl scroll-mt-20 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Outreach projects</h1>
          <p className="text-muted-foreground">
            Each project is one batch: briefing, recipients, drafts.
          </p>
        </div>
        <NewProjectButton />
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              Start your first one — it takes about a minute.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewProjectButton />
          </CardContent>
        </Card>
      ) : (
        <CampaignsList
          campaigns={campaigns.map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            purposeCategory: c.purposeCategory,
            recipientCount: c._count.recipients,
          }))}
        />
      )}
    </div>
  );
}
