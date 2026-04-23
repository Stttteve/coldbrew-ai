import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUserId, withErrorHandler } from "@/lib/guards";
import { logger } from "@/lib/logger";

/**
 * GET  /api/campaigns       — list the signed-in user's projects (most recent first)
 * POST /api/campaigns       — create a new (empty) project; returns its id
 */

const createSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

export const GET = withErrorHandler(async () => {
  const userId = await requireUserId();
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
  return NextResponse.json({ projects: campaigns });
});

export const POST = withErrorHandler(async (req: Request) => {
  const userId = await requireUserId();
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  const name = parsed.success && parsed.data.name ? parsed.data.name : "Untitled project";

  const campaign = await prisma.campaign.create({
    data: { userId, name, status: "draft" },
    select: { id: true, name: true, status: true },
  });
  logger.info("project.create", { projectId: campaign.id, userId });
  return NextResponse.json({ project: campaign }, { status: 201 });
});
