import { stripBriefingBlock } from "@/lib/llm/briefing-extract";

const MAX_PERSISTED_CHARS = 14_000;

/**
 * Turn the client-sent thread + the latest assistant reply into a single
 * block we store on the project row (`briefingConversationContext`) for draft prompts.
 */
export function buildBriefingChatTranscript(
  thread: { role: "user" | "assistant"; content: string }[],
  latestAssistantRaw: string,
): string {
  const parts: string[] = [];
  for (const m of thread) {
    const label = m.role === "user" ? "User" : "Assistant";
    const body =
      m.role === "assistant"
        ? stripBriefingBlock(m.content) || m.content
        : m.content;
    parts.push(`${label}: ${body.trim()}`);
  }
  const lastAssistant =
    stripBriefingBlock(latestAssistantRaw) || latestAssistantRaw;
  parts.push(`Assistant: ${lastAssistant.trim()}`);

  let out = parts.join("\n\n");
  if (out.length > MAX_PERSISTED_CHARS) {
    out = out.slice(-MAX_PERSISTED_CHARS);
  }
  return out;
}
