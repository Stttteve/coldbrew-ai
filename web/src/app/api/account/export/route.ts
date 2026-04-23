import { prisma } from "@/lib/db";
import { requireUserId, withErrorHandler } from "@/lib/guards";

/**
 * GET /api/account/export
 *
 * Streams a JSON blob of everything we have about the signed-in user,
 * EXCLUDING encrypted OAuth tokens (those leave the system only as
 * provider-facing revocation calls). Suitable for the "download my data"
 * button required by GDPR Art. 20 (portability).
 */
export const GET = withErrorHandler(async () => {
  const userId = await requireUserId();

  const [user, providerAccounts, campaigns, recipients, auditLogs] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          defaultSignature: true,
          defaultLinks: true,
          plan: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.providerAccount.findMany({
        where: { userId },
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
      prisma.campaign.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          status: true,
          briefing: true,
          purposeCategory: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.recipientDraft.findMany({
        where: { campaign: { userId } },
        select: {
          id: true,
          campaignId: true,
          email: true,
          name: true,
          title: true,
          organization: true,
          linkedinUrl: true,
          subject: true,
          body: true,
          referencedFacts: true,
          status: true,
          providerDraftId: true,
          deepLink: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { userId },
        select: {
          id: true,
          action: true,
          metadata: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    user,
    providerAccounts,
    campaigns,
    recipients,
    auditLogs,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="coldbrew-export-${userId}.json"`,
    },
  });
});
