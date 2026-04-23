import { z } from "zod";

/**
 * Centralised runtime environment validation.
 *
 * Every env var the app depends on must be declared here. This gives us:
 *   - type-safe access everywhere via `env.DATABASE_URL` (not `process.env.DATABASE_URL!`)
 *   - a single fail-fast location at boot if a required var is missing
 *   - the ability to mark some vars as "required in prod, optional in dev"
 *
 * We separate server-only vars from NEXT_PUBLIC_* vars so a developer cannot
 * accidentally reference a secret in a client component.
 */

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Database / queue
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  // Auth.js core
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters")
    .optional(),
  AUTH_URL: z.string().url().optional(),

  // Google SSO (login)
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // Gmail provider OAuth (separate from SSO above — gmail.compose scope)
  GMAIL_OAUTH_CLIENT_ID: z.string().optional(),
  GMAIL_OAUTH_CLIENT_SECRET: z.string().optional(),
  GMAIL_OAUTH_REDIRECT_URI: z.string().url().optional(),

  // Envelope encryption — master key for dev; prod should use KMS hook
  DATA_ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[A-Fa-f0-9]{64}$/,
      "DATA_ENCRYPTION_KEY must be 32 bytes hex-encoded (64 hex chars)",
    )
    .optional(),

  // LLM providers — adapter picks the first one whose key is set.
  // Priority: Gemini → Anthropic → OpenAI → Stub (see src/lib/llm/index.ts).
  GOOGLE_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(), // alias for GOOGLE_API_KEY
  GEMINI_MODEL_FAST: z.string().optional(),
  GEMINI_MODEL_STRONG: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Enrichment providers (phase 3+)
  HUNTER_API_KEY: z.string().optional(),
  APOLLO_API_KEY: z.string().optional(),
  PROXYCURL_API_KEY: z.string().optional(),

  // Feature flags
  FEATURE_OUTLOOK: booleanString.default(false),
  /**
   * Set to true in production to use the BullMQ worker processes. In dev,
   * leaving this off means enrichment/drafting runs inline on the request
   * thread — simpler to reason about and no worker to babysit.
   */
  USE_QUEUE_WORKERS: booleanString.default(false),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("Coldbrew AI"),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

function parseEnv() {
  const serverResult = serverSchema.safeParse(process.env);
  const clientResult = clientSchema.safeParse(process.env);

  if (!serverResult.success) {
    console.error(
      "❌ Invalid environment variables:",
      serverResult.error.flatten().fieldErrors,
    );
    throw new Error("Invalid server environment variables");
  }
  if (!clientResult.success) {
    console.error(
      "❌ Invalid client environment variables:",
      clientResult.error.flatten().fieldErrors,
    );
    throw new Error("Invalid client environment variables");
  }

  return { ...serverResult.data, ...clientResult.data };
}

export const env: ServerEnv & ClientEnv = parseEnv();
