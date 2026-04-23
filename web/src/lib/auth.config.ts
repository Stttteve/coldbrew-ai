import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible Auth.js config.
 *
 * This subset is what middleware imports — it must contain ZERO references
 * to anything that can't run on the Edge runtime (no Prisma, no argon2, no
 * Node-native modules). We re-use it from `auth.ts` where we layer on the
 * Node-only pieces (Credentials authorize + PrismaAdapter).
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  // No providers listed here — they are added in auth.ts.
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
