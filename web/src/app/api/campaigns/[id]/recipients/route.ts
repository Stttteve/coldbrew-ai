import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  HttpError,
  requireOwnedCampaign,
  requireUserId,
  withErrorHandler,
} from "@/lib/guards";
import {
  parseCsv,
  parseRecipientBlock,
  type ParsedRecipient,
  type CsvRow,
} from "@/lib/parsing/recipients";
import { recipientToClientJson } from "@/lib/campaigns/recipient-json";
import { enqueueEnrichment } from "@/lib/queue";
import { runEnrichmentJob } from "@/workers/enrichment-runner";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * POST /api/campaigns/:id/recipients
 * Body (one of):
 *   { mode: "paste",  text: string }
 *   { mode: "csv",    text: string }
 *   { mode: "manual", recipients: [{ email?, name?, linkedinUrl? }, ...] }
 *
 * Parses, deduplicates against existing recipients, inserts them with
 * status="pending", and enqueues enrichment jobs.
 */

const MAX_ROWS_PER_REQUEST = 500;

const bodySchema = z.union([
  z.object({ mode: z.literal("paste"), text: z.string().min(1).max(200_000) }),
  z.object({ mode: z.literal("csv"), text: z.string().min(1).max(1_048_576) }),
  z.object({
    mode: z.literal("manual"),
    recipients: z
      .array(
        z.object({
          email: z.string().email().max(256).optional(),
          name: z.string().min(1).max(200).optional(),
          organization: z.string().min(1).max(200).optional(),
          title: z.string().min(1).max(200).optional(),
          linkedinUrl: z.string().url().max(500).optional(),
        }),
      )
      .min(1)
      .max(20),
  }),
]);

export const POST = withErrorHandler(
  async (req: Request, ctx: { params: { id: string } }) => {
    const userId = await requireUserId();
    const campaign = await requireOwnedCampaign(ctx.params.id, userId);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "invalid_input");

    let rowsToInsert: RecipientInput[] = [];

    if (parsed.data.mode === "paste") {
      const parsedRows = parseRecipientBlock(parsed.data.text);
      rowsToInsert = parsedRows.map(fromParsedLine);
    } else if (parsed.data.mode === "csv") {
      const rows = parseCsv(parsed.data.text);
      if (rows.length > MAX_ROWS_PER_REQUEST) {
        throw new HttpError(400, "too_many_rows", `Max ${MAX_ROWS_PER_REQUEST}.`);
      }
      rowsToInsert = rows.map(fromCsvRow);
    } else {
      rowsToInsert = parsed.data.recipients.map((r) => ({
        inputRaw: JSON.stringify(r),
        email: r.email?.toLowerCase() ?? null,
        name: r.name ?? null,
        organization: r.organization ?? null,
        title: r.title ?? null,
        linkedinUrl: r.linkedinUrl ?? null,
      }));
    }

    // Dedupe within the payload first
    rowsToInsert = dedupeLocal(rowsToInsert);

    // Then dedupe against what's already on the project
    const existing = await prisma.recipientDraft.findMany({
      where: { campaignId: campaign.id },
      select: { email: true, linkedinUrl: true, name: true },
    });
    const seenEmails = new Set(
      existing.map((e) => e.email?.toLowerCase()).filter(Boolean) as string[],
    );
    const seenLinkedin = new Set(
      existing
        .map((e) => e.linkedinUrl?.toLowerCase())
        .filter(Boolean) as string[],
    );
    rowsToInsert = rowsToInsert.filter((r) => {
      if (r.email && seenEmails.has(r.email)) return false;
      if (r.linkedinUrl && seenLinkedin.has(r.linkedinUrl.toLowerCase()))
        return false;
      return true;
    });

    if (rowsToInsert.length === 0) {
      return NextResponse.json({ recipients: [] });
    }

    // createMany + immediately refetch so we have the ids + default timestamps
    await prisma.recipientDraft.createMany({
      data: rowsToInsert.map((r) => ({
        campaignId: campaign.id,
        inputRaw: r.inputRaw,
        email: r.email,
        name: r.name,
        title: r.title,
        organization: r.organization,
        linkedinUrl: r.linkedinUrl,
        status: "pending",
      })),
    });

    const created = await prisma.recipientDraft.findMany({
      where: {
        campaignId: campaign.id,
        OR: rowsToInsert.map((r) => ({
          inputRaw: r.inputRaw,
          ...(r.email ? { email: r.email } : {}),
        })),
      },
      orderBy: { createdAt: "asc" },
    });

    // Fan out enrichment. When running inline (dev mode without queue
    // workers) we actually AWAIT the jobs so the response carries the
    // post-enrichment state — otherwise the UI would see `pending` for
    // every row and never catch up. In queue-worker mode this returns
    // immediately and the UI is expected to poll.
    if (env.USE_QUEUE_WORKERS && env.REDIS_URL) {
      await Promise.all(created.map((r) => enqueueEnrichment(r.id)));
    } else {
      await Promise.all(created.map((r) => runEnrichmentJob(r.id)));
    }

    // Re-fetch so we have the post-enrichment fields populated.
    const fresh = await prisma.recipientDraft.findMany({
      where: { id: { in: created.map((r) => r.id) } },
      orderBy: { createdAt: "asc" },
    });

    logger.info("recipients.added", {
      campaignId: campaign.id,
      count: fresh.length,
    });

    return NextResponse.json({
      recipients: fresh.map(recipientToClientJson),
    });
  },
);

// ----- helpers -----

interface RecipientInput {
  inputRaw: string;
  email: string | null;
  name: string | null;
  title: string | null;
  organization: string | null;
  linkedinUrl: string | null;
}

function fromParsedLine(p: ParsedRecipient): RecipientInput {
  return {
    inputRaw: p.raw,
    email: p.email?.toLowerCase() ?? null,
    name: p.name ?? null,
    title: null,
    organization: null,
    linkedinUrl: p.linkedinUrl ?? null,
  };
}

function fromCsvRow(r: CsvRow): RecipientInput {
  return {
    inputRaw: JSON.stringify(r),
    email: r.email?.toLowerCase() ?? null,
    name: r.name ?? null,
    title: r.title ?? null,
    organization: r.organization ?? null,
    linkedinUrl: r.linkedinUrl ?? null,
  };
}

function dedupeLocal(rows: RecipientInput[]): RecipientInput[] {
  const seen = new Set<string>();
  const out: RecipientInput[] = [];
  for (const r of rows) {
    const key =
      r.email?.toLowerCase() ?? r.linkedinUrl?.toLowerCase() ?? r.name ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

