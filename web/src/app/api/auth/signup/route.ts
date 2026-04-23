import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "@node-rs/argon2";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * POST /api/auth/signup
 * Body: { email, password, name? }
 *
 * Creates a local User with an argon2id password hash. Does NOT sign the user
 * in automatically — the client follows up by calling Auth.js signIn() with
 * credentials. Splitting signup from sign-in keeps the server stateless here.
 */

const signupSchema = z.object({
  email: z.string().email().max(256),
  password: z.string().min(8).max(128),
  name: z.string().max(100).optional(),
});

// argon2id parameters — OWASP recommended baseline as of 2024.
// Increase memoryCost once load-tested on the target hardware.
const ARGON2_PARAMS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Don't leak whether an email exists — but for usability here we do.
    // Swap for a 204 "check your email" pattern once transactional email is live.
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await hash(parsed.data.password, ARGON2_PARAMS);

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash,
    },
    select: { id: true, email: true, name: true },
  });

  logger.info("user.signup", { userId: user.id });

  return NextResponse.json({ user }, { status: 201 });
}
