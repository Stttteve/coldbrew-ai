/**
 * Vendor-agnostic LLM interface.
 *
 * Every call into a language model MUST go through a `ModelAdapter`. This
 * means:
 *   - we can swap Anthropic ↔ OpenAI ↔ a local stub without touching callers
 *   - tests never hit the network (they install the stub adapter)
 *   - budget + logging middleware has exactly one choke point
 *
 * Two tiers are defined by convention:
 *   - "fast"     — cheap / streaming chat (briefing interviewer)
 *   - "strong"   — reasoning-class (per-recipient draft writer)
 *
 * The concrete model name is chosen inside each adapter so callers only say
 * "give me the fast model" not "claude-3-5-haiku-20241022".
 */

export type ModelTier = "fast" | "strong";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  tier: ModelTier;
  messages: ChatMessage[];
  /** Optional upper bound on response tokens. Adapter may clamp. */
  maxTokens?: number;
  /** Temperature in [0, 1]. Adapter picks sane default if omitted. */
  temperature?: number;
  /** If set, adapter must steer the model toward returning JSON matching this name.
   *  The adapter is responsible for vendor-specific enforcement. */
  jsonSchemaName?: string;
}

export interface GenerateResult {
  text: string;
  /** Sum of input + output tokens (approximate). */
  tokensUsed: number;
  /** Which model actually served the request. */
  model: string;
}

export interface StreamEvent {
  type: "token" | "end" | "error";
  /** For `token`: the text delta. For `error`: the message. */
  text?: string;
  /** Present on `end`. */
  usage?: { tokensUsed: number; model: string };
}

export interface ModelAdapter {
  readonly vendor: "anthropic" | "openai" | "gemini" | "stub";

  /** Non-streaming request. Preferred for structured output. */
  generate(opts: GenerateOptions): Promise<GenerateResult>;

  /** Streaming request. Yields one `StreamEvent` at a time. */
  stream(opts: GenerateOptions): AsyncIterable<StreamEvent>;
}
