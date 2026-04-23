import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUserId, withErrorHandler } from "@/lib/guards";

/**
 * PATCH /api/account/profile
 *
 * Update the user's default signature / personal links. Used from Settings.
 */
const schema = z.object({
  name: z.string().max(120).nullable().optional(),
  defaultSignature: z.string().max(2000).nullable().optional(),
  defaultLinks: z
    .object({
      cv: z.string().url().max(500).optional(),
      github: z.string().url().max(500).optional(),
      portfolio: z.string().url().max(500).optional(),
    })
    .nullable()
    .optional(),
});

export const PATCH = withErrorHandler(async (req: Request) => {
  const userId = await requireUserId();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name === undefined ? undefined : parsed.data.name,
      defaultSignature:
        parsed.data.defaultSignature === undefined
          ? undefined
          : parsed.data.defaultSignature,
      defaultLinks:
        parsed.data.defaultLinks === undefined
          ? undefined
          : parsed.data.defaultLinks ?? undefined,
    },
    select: {
      name: true,
      defaultSignature: true,
      defaultLinks: true,
    },
  });
  return NextResponse.json({ user: updated });
});
