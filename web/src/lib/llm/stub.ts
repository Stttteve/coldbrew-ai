import type {
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  ModelAdapter,
  StreamEvent,
} from "./types";

/**
 * Deterministic, offline "LLM" adapter.
 *
 * Why ship this? Two reasons:
 *   1. Local development without API keys. The whole flow (briefing → drafts
 *      → push) is demonstrable end-to-end before Anthropic/OpenAI are wired.
 *   2. Tests. Vitest runs use this adapter so CI never depends on a vendor.
 *
 * Behaviours:
 *   - If the LAST user message looks like a briefing draft prompt, we return
 *     a valid JSON envelope (subject + body + referenced_facts).
 *   - Otherwise we emulate the briefing interviewer: ask one question, then
 *     emit the final <briefing_json>...</briefing_json> block as soon as the
 *     user says "done" or after three assistant turns.
 *
 * The output is intentionally boring but SCHEMA-VALID, which is all we need
 * for UI development.
 */

function lastUserMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i];
  }
  return null;
}

function assistantTurnsSoFar(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === "assistant").length;
}

function isDraftPrompt(content: string): boolean {
  return (
    content.includes("Write a cold email") &&
    content.includes("Recipient profile")
  );
}

function extractFromDraftPrompt(content: string): {
  recipientName: string;
  organization: string;
  specificAsk: string;
  tone: string;
  length: number;
  facts: string[];
} {
  const grab = (re: RegExp) => content.match(re)?.[1]?.trim() ?? "";
  const facts: string[] = [];
  const title = grab(/Title:\s*(.+)/);
  const org = grab(/Organization:\s*(.+)/);
  const oneLiner = grab(/One-liner:\s*(.+)/);
  if (title && title !== "(unknown)") facts.push(`title: ${title}`);
  if (org && org !== "(unknown)") facts.push(`organization: ${org}`);
  if (oneLiner && oneLiner !== "(none)") facts.push(oneLiner);
  return {
    recipientName: grab(/Name:\s*(.+)/) || "there",
    organization: org || "your team",
    specificAsk: grab(/Specific ask:\s*(.+)/),
    tone: grab(/Tone:\s*(.+)/),
    length: parseInt(grab(/Target length:\s*(\d+)/), 10) || 120,
    facts,
  };
}

function makeStubDraft(content: string): string {
  const r = extractFromDraftPrompt(content);
  const recipientFirst =
    r.recipientName !== "(unknown)" ? r.recipientName.split(/\s+/)[0] : "there";
  const subject = `Quick question about ${r.organization || "your work"}`;
  const body = [
    `Hi ${recipientFirst},`,
    ``,
    `I hope this finds you well. I'm reaching out because ${r.specificAsk || "I'd love to connect"}.`,
    r.facts.length
      ? `I saw that you work on ${r.facts.slice(0, 2).join(" and ")}, which is directly relevant to what I'm interested in.`
      : `I came across your profile and thought you'd be a great person to connect with.`,
    ``,
    `Would you have 15 minutes in the next week or two for a quick chat?`,
    ``,
    `Thanks for considering,`,
    `— (sender)`,
  ].join("\n");
  const wc = body.split(/\s+/).filter(Boolean).length;
  return JSON.stringify({
    subject,
    body,
    referenced_facts: r.facts,
    word_count: wc,
    confidence: 0.55,
  });
}

function makeStubBriefingReply(messages: ChatMessage[]): string {
  const turns = assistantTurnsSoFar(messages);
  const last = lastUserMessage(messages)?.content.toLowerCase() ?? "";
  const done = last.includes("done") || turns >= 3;

  if (done) {
    return [
      "<briefing_json>",
      JSON.stringify(
        {
          purpose_category: "general_inquiry",
          sender_role: "student / professional reaching out",
          specific_ask: "15-minute chat to learn more",
          tone: "semi_formal",
          length_target: 130,
          must_mention: [],
          signoff_style: "warm",
        },
        null,
        2,
      ),
      "</briefing_json>",
    ].join("\n");
  }

  const questions = [
    "Got it — what specific ask should each email make? (e.g. a 15-minute chat, a code review, a research opportunity)",
    "Thanks. What tone feels right — formal, semi-formal, or casual?",
    "Anything you want mentioned in every email? (CV link, portfolio, availability…) If nothing, say \"none\".",
  ];
  return questions[Math.min(turns, questions.length - 1)];
}

export class StubAdapter implements ModelAdapter {
  readonly vendor = "stub" as const;

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const last = lastUserMessage(opts.messages);
    const text =
      last && isDraftPrompt(last.content)
        ? makeStubDraft(last.content)
        : makeStubBriefingReply(opts.messages);
    return {
      text,
      tokensUsed: Math.ceil(text.length / 4),
      model: "stub/echo-1",
    };
  }

  async *stream(opts: GenerateOptions): AsyncIterable<StreamEvent> {
    const { text, tokensUsed, model } = await this.generate(opts);
    // Emit in ~20-char chunks for a believable streaming feel in the UI.
    const chunkSize = 20;
    for (let i = 0; i < text.length; i += chunkSize) {
      yield { type: "token", text: text.slice(i, i + chunkSize) };
      await new Promise((r) => setTimeout(r, 15));
    }
    yield { type: "end", usage: { tokensUsed, model } };
  }
}
