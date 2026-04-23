import { prisma } from "@/lib/db";
import { getModel } from "@/lib/llm";
import { buildDraftPrompt } from "@/lib/llm/prompts";
import { briefingSchema, draftSchema } from "@/lib/llm/schemas";
import { validateDraft } from "@/lib/llm/validators";
import { stripTrailingConfiguredSignature } from "@/lib/email/compose-signature";
import { scrubPlaceholders } from "@/lib/llm/scrub";
import { logger } from "@/lib/logger";
import type { RecipientDraft } from "@prisma/client";

/**
 * Single-recipient draft generation worker.
 *
 * Runs with:
 *   - one model call using the `strong` tier
 *   - up to 1 retry if the JSON is malformed OR a `reject` validator fires
 *   - structured error reporting onto the row
 *
 * `instruction` is an optional natural-language tweak used by the
 * "Regenerate with instruction" feature. We prepend it as an extra user
 * message after the main prompt.
 */

export interface DraftRunResult {
  ok: boolean;
  warnings: string[];
  error?: string;
}

const MAX_RETRIES = 1;

export async function runDraftJob(
  recipientId: string,
  instruction?: string,
): Promise<DraftRunResult> {
  const r = await prisma.recipientDraft.findUnique({
    where: { id: recipientId },
    include: { campaign: true },
  });
  if (!r || !r.campaign) {
    return { ok: false, warnings: [], error: "recipient_not_found" };
  }

  const briefingParsed = briefingSchema.safeParse(r.campaign.briefing);
  if (!briefingParsed.success) {
    await markError(r.id, "briefing_missing_or_invalid");
    return {
      ok: false,
      warnings: [],
      error: "briefing_missing_or_invalid",
    };
  }
  const briefing = briefingParsed.data;

  await prisma.recipientDraft.update({
    where: { id: r.id },
    data: { status: "drafting", errorReason: null },
  });

  const model = getModel();
  const enrichment = (r.enrichment ?? {}) as {
    oneLiner?: string;
    raw?: { headline?: string; summary?: string };
  };
  const recipientCtx = {
    name: r.name,
    title: r.title,
    organization: r.organization,
    one_liner: enrichment?.oneLiner ?? null,
    linkedin_summary:
      (enrichment?.raw as { summary?: string } | undefined)?.summary ?? null,
  };
  const hadFacts =
    !!r.title ||
    !!r.organization ||
    !!recipientCtx.one_liner ||
    !!recipientCtx.linkedin_summary;

  const user = await prisma.user.findUnique({
    where: { id: r.campaign.userId },
    select: { defaultSignature: true },
  });

  let basePrompt = buildDraftPrompt({
    briefing,
    briefingConversationContext: r.campaign.briefingConversationContext,
    recipient: recipientCtx,
    senderSignature: user?.defaultSignature ?? null,
  });
  if (instruction) {
    basePrompt += `\n\nAdditional instruction from the user (apply to this regeneration only):\n${instruction}`;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await model.generate({
        tier: "strong",
        maxTokens: 1200,
        temperature: 0.6 + attempt * 0.1,
        jsonSchemaName: "draft",
        messages: [
          { role: "user", content: basePrompt },
        ],
      });

      const json = extractFirstJsonObject(res.text);
      const parsed = draftSchema.safeParse(json);
      if (!parsed.success) {
        if (attempt === MAX_RETRIES) {
          await markError(r.id, "invalid_draft_json");
          return { ok: false, warnings: [], error: "invalid_draft_json" };
        }
        continue;
      }
      const draft = parsed.data;
      const issues = validateDraft(draft, {
        recipientName: r.name,
        targetLength: briefing.length_target,
        hadRecipientFacts: hadFacts,
      });
      const rejecting = issues.filter((i) => i.severity === "reject");
      if (rejecting.length && attempt < MAX_RETRIES) {
        // retry once
        continue;
      }

      // Last-resort scrub: if placeholder tokens still survived the
      // prompt + retry loop, silently delete the offending sentences
      // before writing to the DB. The draft is still "drafted" but any
      // bracketed hints are gone.
      let scrubbedBody = scrubPlaceholders(draft.body);
      scrubbedBody = stripTrailingConfiguredSignature(
        scrubbedBody,
        user?.defaultSignature,
      );

      await prisma.recipientDraft.update({
        where: { id: r.id },
        data: {
          subject: draft.subject,
          body: scrubbedBody,
          referencedFacts: draft.referenced_facts,
          status: "drafted",
          errorReason: rejecting.length
            ? `rejected: ${rejecting.map((i) => i.code).join(",")}`
            : null,
        },
      });

      // Usage accounting — best-effort.
      await prisma.user
        .update({
          where: { id: r.campaign.userId },
          data: { monthlyTokenUsage: { increment: res.tokensUsed } },
        })
        .catch(() => {});

      logger.info("draft.generated", {
        recipientId: r.id,
        tokensUsed: res.tokensUsed,
        model: res.model,
        warnings: issues.filter((i) => i.severity === "warn").map((i) => i.code),
      });
      return {
        ok: true,
        warnings: issues.filter((i) => i.severity === "warn").map((i) => i.message),
      };
    } catch (e) {
      if (attempt === MAX_RETRIES) {
        await markError(r.id, `model_call_failed: ${(e as Error).message}`);
        return { ok: false, warnings: [], error: (e as Error).message };
      }
    }
  }

  await markError(r.id, "exhausted_retries");
  return { ok: false, warnings: [], error: "exhausted_retries" };
}

async function markError(id: string, reason: string) {
  await prisma.recipientDraft
    .update({
      where: { id },
      data: { status: "error", errorReason: reason },
    })
    .catch(() => {});
}

/**
 * Grab the first balanced `{ ... }` JSON object out of a string. The model
 * sometimes wraps JSON in explanatory prose despite our prompt — be lenient.
 */
function extractFirstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') inString = !inString;
    else if (!inString && c === "{") depth++;
    else if (!inString && c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// Exposed for unit tests only.
export const __testables__ = { extractFirstJsonObject };

// Re-export so the generate route can fan these out directly in dev.
export async function ensureRecipientsEnriched(
  recipients: RecipientDraft[],
): Promise<void> {
  const { runEnrichmentJob } = await import("./enrichment-runner");
  await Promise.all(
    recipients
      .filter(
        (r) =>
          r.status === "pending" ||
          r.status === "enriching",
      )
      .map((r) => runEnrichmentJob(r.id)),
  );
}
