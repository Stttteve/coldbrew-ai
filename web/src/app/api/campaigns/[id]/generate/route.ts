import { NextResponse } from "next/server";

import { recipientToClientJson } from "@/lib/campaigns/recipient-json";
import { prisma } from "@/lib/db";
import {
  HttpError,
  requireOwnedCampaign,
  requireUserId,
  withErrorHandler,
} from "@/lib/guards";
import { briefingSchema } from "@/lib/llm/schemas";
import { logger } from "@/lib/logger";
import { ensureRecipientsEnriched, runDraftJob } from "@/workers/draft-runner";

/**
 * POST /api/campaigns/:id/generate
 *
 * Runs draft generation for every recipient on the project that is not
 * already drafted / approved / pushed.
 *
 * Concurrency: we cap parallelism at 10, matching the spec. This is the
 * inline (synchronous) implementation — for long projects on real LLM keys
 * you'd want to enqueue to BullMQ and stream progress over SSE. That's a
 * clean upgrade from here: swap the loop below for `enqueueDraft()` calls.
 */

const CONCURRENCY = 10;

export const POST = withErrorHandler(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const userId = await requireUserId();
    const campaign = await requireOwnedCampaign(ctx.params.id, userId);

    const briefingCheck = briefingSchema.safeParse(campaign.briefing);
    if (!briefingCheck.success) {
      throw new HttpError(
        400,
        "briefing_incomplete",
        "Complete your briefing (info briefing + briefing summary) before generating drafts.",
      );
    }

    const recipients = await prisma.recipientDraft.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: "asc" },
    });
    if (recipients.length === 0) {
      throw new HttpError(400, "no_recipients", "Add recipients first.");
    }

    // Ensure every recipient has been through enrichment at least once.
    await ensureRecipientsEnriched(recipients);

    // Pick the ones that still need a draft.
    const toDraft = recipients.filter(
      (r) =>
        r.status !== "drafted" &&
        r.status !== "approved" &&
        r.status !== "pushed" &&
        r.status !== "sent",
    );

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "generating" },
    });

    const warnings: Record<string, string[]> = {};
    const errors: Record<string, string> = {};

    // Run in chunks of CONCURRENCY.
    for (let i = 0; i < toDraft.length; i += CONCURRENCY) {
      const slice = toDraft.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        slice.map((r) => runDraftJob(r.id).catch((e) => ({
          ok: false as const,
          warnings: [],
          error: (e as Error).message,
        }))),
      );
      slice.forEach((r, idx) => {
        const res = results[idx];
        if (res.ok) warnings[r.id] = res.warnings;
        else errors[r.id] = res.error ?? "unknown_error";
      });
    }

    const fresh = await prisma.recipientDraft.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: "asc" },
    });

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "ready" },
    });

    logger.info("project.generate.done", {
      projectId: campaign.id,
      successes: Object.keys(warnings).length,
      failures: Object.keys(errors).length,
    });

    return NextResponse.json({
      recipients: fresh.map(recipientToClientJson),
      warnings,
      errors,
    });
  },
);
