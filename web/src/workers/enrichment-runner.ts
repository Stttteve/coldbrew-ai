import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { enrichRecipient } from "@/lib/enrichment";
import { logger } from "@/lib/logger";

/**
 * Pure worker function — no BullMQ glue. Called either by the Redis worker
 * (`src/workers/enrichment.ts`) or inline by the queue façade when Redis
 * is unavailable in dev.
 *
 * Transitions the recipient from `pending` → `enriching` → `enriched` |
 * `error`. Never throws — errors are recorded on the row.
 */
export async function runEnrichmentJob(recipientId: string): Promise<void> {
  const r = await prisma.recipientDraft.findUnique({
    where: { id: recipientId },
  });
  if (!r) return;
  // Only enrich rows that haven't been drafted yet.
  if (
    r.status === "drafted" ||
    r.status === "approved" ||
    r.status === "pushed" ||
    r.status === "sent" ||
    r.status === "enriching"
  ) {
    return;
  }

  await prisma.recipientDraft.update({
    where: { id: r.id },
    data: { status: "enriching" },
  });

  try {
    const result = await enrichRecipient({
      email: r.email ?? undefined,
      name: r.name ?? undefined,
      organization: r.organization ?? undefined,
      linkedinUrl: r.linkedinUrl ?? undefined,
    });

    await prisma.recipientDraft.update({
      where: { id: r.id },
      data: {
        status: "enriched",
        name: r.name ?? result?.name ?? null,
        title: r.title ?? result?.title ?? null,
        organization: r.organization ?? result?.organization ?? null,
        enrichment: JSON.parse(
          JSON.stringify(result ?? { source: "none" }),
        ) as Prisma.InputJsonValue,
      },
    });
    logger.info("enrichment.done", {
      recipientId: r.id,
      source: result?.source ?? "none",
    });
  } catch (e) {
    await prisma.recipientDraft.update({
      where: { id: r.id },
      data: {
        status: "error",
        errorReason: `enrichment: ${(e as Error).message}`,
      },
    });
    logger.error("enrichment.failed", {
      recipientId: r.id,
      message: (e as Error).message,
    });
  }
}
