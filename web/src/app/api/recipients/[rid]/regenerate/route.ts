import { NextResponse } from "next/server";
import { z } from "zod";

import { recipientToClientJson } from "@/lib/campaigns/recipient-json";
import { prisma } from "@/lib/db";
import {
  HttpError,
  requireUserId,
  withErrorHandler,
} from "@/lib/guards";
import { runDraftJob } from "@/workers/draft-runner";

/**
 * POST /api/recipients/:rid/regenerate
 * Body: { instruction?: string }
 *
 * Re-generates a single draft, optionally with a natural-language tweak
 * from the user ("make it shorter", "more formal", etc). We always walk
 * back through `runDraftJob` so quality validators run the same way.
 */

const schema = z.object({
  instruction: z.string().max(500).optional(),
});

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: { rid: string } }) => {
    const userId = await requireUserId();
    const recipient = await prisma.recipientDraft.findUnique({
      where: { id: ctx.params.rid },
      include: { campaign: true },
    });
    if (!recipient || recipient.campaign.userId !== userId) {
      throw new HttpError(404, "not_found");
    }
    if (recipient.status === "sent" || recipient.status === "pushed") {
      throw new HttpError(
        400,
        "cannot_regenerate",
        "This row already left Coldbrew via Gmail — regenerate is disabled.",
      );
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(400, "invalid_input");

    const result = await runDraftJob(recipient.id, parsed.data.instruction);
    const fresh = await prisma.recipientDraft.findUnique({
      where: { id: recipient.id },
    });

    return NextResponse.json({
      recipient: recipientToClientJson(fresh!),
      result,
    });
  },
);
