import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";
import type {
  GenerateOptions,
  GenerateResult,
  ModelAdapter,
  StreamEvent,
} from "./types";

/**
 * Anthropic adapter (primary per the spec).
 *
 * Model choice by tier:
 *   - fast:   claude-3-5-haiku-latest   (cheap, fast — used for briefing chat)
 *   - strong: claude-sonnet-4-5-latest  (reasoning — used for per-recipient drafts)
 *
 * The SDK handles both streaming and non-streaming via `messages.create`
 * / `messages.stream`. We convert Claude events into our vendor-neutral
 * `StreamEvent` shape.
 */

const MODEL_BY_TIER = {
  fast: "claude-3-5-haiku-latest",
  strong: "claude-sonnet-4-5-latest",
} as const;

export class AnthropicAdapter implements ModelAdapter {
  readonly vendor = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(apiKey: string = env.ANTHROPIC_API_KEY ?? "") {
    if (!apiKey) {
      throw new Error(
        "AnthropicAdapter instantiated without an API key. Set ANTHROPIC_API_KEY or use the stub adapter.",
      );
    }
    this.client = new Anthropic({ apiKey });
  }

  private splitMessages(messages: GenerateOptions["messages"]) {
    // Claude wants system separate from the messages array.
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const turns = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    return { system: system || undefined, turns };
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const { system, turns } = this.splitMessages(opts.messages);
    const model = MODEL_BY_TIER[opts.tier];
    const res = await this.client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.5,
      system,
      messages: turns,
    });
    // res.content is a Block[]. For pure text replies each block has type: "text".
    const text = (res.content ?? [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const tokensUsed =
      (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
    return { text, tokensUsed, model };
  }

  async *stream(opts: GenerateOptions): AsyncIterable<StreamEvent> {
    const { system, turns } = this.splitMessages(opts.messages);
    const model = MODEL_BY_TIER[opts.tier];

    const s = this.client.messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.5,
      system,
      messages: turns,
    });

    for await (const event of s) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "token", text: event.delta.text };
      }
    }
    const final = await s.finalMessage();
    yield {
      type: "end",
      usage: {
        tokensUsed:
          (final.usage?.input_tokens ?? 0) + (final.usage?.output_tokens ?? 0),
        model,
      },
    };
  }
}
