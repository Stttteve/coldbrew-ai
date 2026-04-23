import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  HttpError,
  requireOwnedCampaign,
  requireUserId,
  withErrorHandler,
} from "@/lib/guards";
import { getModel } from "@/lib/llm";
import { BRIEFING_SYSTEM_PROMPT } from "@/lib/llm/prompts";
import { buildBriefingChatTranscript } from "@/lib/briefing/chat-transcript";
import { extractBriefing } from "@/lib/llm/briefing-extract";
import { sseResponse } from "@/lib/sse";
import { logger } from "@/lib/logger";

/**
 * POST /api/campaigns/:id/briefing/chat
 *
 * Streams a briefing-interviewer reply back to the client as SSE.
 *
 * Body:
 *   {
 *     messages: [{ role: "user" | "assistant", content: string }, ...]
 *   }
 *
 * The caller keeps the conversation on the client and re-sends the full
 * message list with each turn. This keeps the endpoint stateless and makes
 * it trivial to "rewind" the chat in the UI. When the assistant emits a
 * <briefing_json> block, we persist it to the project `briefing` JSON on the server.
 *
 * SSE frames:
 *   event: token      { text: string }
 *   event: briefing   { briefing: Briefing }    (optional; only if extracted)
 *   event: end        { model, tokensUsed, text }
 *   event: error      { message }
 */

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: { id: string } }) => {
    const userId = await requireUserId();
    const campaign = await requireOwnedCampaign(ctx.params.id, userId);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "invalid_input");

    const clientThread = parsed.data.messages;

    const model = getModel();
    const messages = [
      { role: "system" as const, content: BRIEFING_SYSTEM_PROMPT },
      ...clientThread,
    ];

    // Capture the full assistant text as tokens stream so we can post-process.
    async function* gen() {
      let full = "";
      let usage: { tokensUsed: number; model: string } | undefined;
      try {
        for await (const evt of model.stream({ tier: "fast", messages })) {
          if (evt.type === "token" && evt.text) {
            full += evt.text;
            yield { event: "token", data: { text: evt.text } };
          } else if (evt.type === "end") {
            usage = evt.usage;
          } else if (evt.type === "error") {
            yield {
              event: "error",
              data: { message: evt.text ?? "stream_error" },
            };
            return;
          }
        }
      } catch (e) {
        yield {
          event: "error",
          data: { message: (e as Error).message || "stream_failed" },
        };
        return;
      }

      const extracted = extractBriefing(full);
      const transcript = buildBriefingChatTranscript(clientThread, full);

      try {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            briefingConversationContext: transcript,
            ...(extracted
              ? {
                  briefing: extracted,
                  purposeCategory: extracted.purpose_category,
                  status: campaign.status === "draft" ? "draft" : campaign.status,
                }
              : {}),
          },
        });
        if (extracted) {
          yield {
            event: "briefing",
            data: { briefing: extracted },
          };
          logger.info("project.briefing.extracted", {
            projectId: campaign.id,
          });
        }
      } catch (e) {
        logger.warn("project.briefing.persist_failed", {
          message: (e as Error).message,
        });
      }

      yield {
        event: "end",
        data: { usage, text: full },
      };
    }

    return sseResponse(gen());
  },
);
