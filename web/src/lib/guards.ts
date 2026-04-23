import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Lightweight authorization helpers used in API routes.
 *
 * `requireUser` fails a request immediately if there's no session. All helpers
 * return plain Response objects so route handlers can early-return them.
 */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError(401, "unauthorized");
  return session.user.id;
}

export async function requireOwnedCampaign(campaignId: string, userId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c || c.userId !== userId) throw new HttpError(404, "project_not_found");
  return c;
}

/** Wrap a route handler so thrown HttpErrors become proper Response objects. */
export function withErrorHandler<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof HttpError) {
        return Response.json(
          { error: e.code, message: e.message },
          { status: e.status },
        );
      }
      console.error("unhandled_route_error", e);
      return Response.json(
        { error: "internal_error", message: (e as Error).message },
        { status: 500 },
      );
    }
  };
}
