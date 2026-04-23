import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { verify as argon2Verify } from "@node-rs/argon2";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { authConfig } from "@/lib/auth.config";

/**
 * Full (Node-runtime) Auth.js configuration.
 *
 * Layered on top of the edge-safe authConfig:
 *   - Credentials provider (email + password with argon2id)
 *   - Google SSO provider (login identity only — gmail scopes live elsewhere)
 *   - PrismaAdapter for account/session persistence
 *
 * Any route that needs `auth()`, `signIn()`, `signOut()` imports from here.
 * Middleware imports the edge config directly.
 */

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  secret: env.AUTH_SECRET,
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user?.passwordHash) return null;

        const ok = await argon2Verify(user.passwordHash, parsed.data.password);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        };
      },
    }),
    ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: env.AUTH_GOOGLE_ID,
            clientSecret: env.AUTH_GOOGLE_SECRET,
            authorization: {
              params: { scope: "openid email profile" },
            },
          }),
        ]
      : []),
  ],
});
