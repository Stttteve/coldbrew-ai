// Thin re-export so that next-auth's generated route handlers are created
// once and reused; importing `handlers` from auth.ts inside the route file
// works too but this keeps the route file a tiny one-liner.
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
