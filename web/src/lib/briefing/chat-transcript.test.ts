import { describe, it, expect } from "vitest";

import { buildBriefingChatTranscript } from "./chat-transcript";

describe("buildBriefingChatTranscript", () => {
  it("joins thread and final assistant reply", () => {
    const t = buildBriefingChatTranscript(
      [
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "I want to reach professors." },
      ],
      "Got it — tell me your role.",
    );
    expect(t).toContain("User: I want to reach professors.");
    expect(t).toContain("Got it — tell me your role.");
  });

  it("strips briefing JSON from assistant history", () => {
    const jsonBlock = `<briefing_json>{"purpose_category":"general_inquiry"}</briefing_json>`;
    const t = buildBriefingChatTranscript(
      [{ role: "assistant", content: `Here you go.\n${jsonBlock}` }],
      "Next question?",
    );
    expect(t).not.toContain("purpose_category");
  });
});
