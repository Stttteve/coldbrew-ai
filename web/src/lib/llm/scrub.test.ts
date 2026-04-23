import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.DATABASE_URL ??= "postgres://test@localhost:5432/test";
});

describe("scrubPlaceholders", () => {
  it("drops the whole bracketed-hint sentence but keeps the rest", async () => {
    const { scrubPlaceholders } = await import("./scrub");
    const input =
      "Hi Alice. I have been following developments in [mention a specific area] and am impressed. Would you be open to a chat?";
    const out = scrubPlaceholders(input);
    expect(out).toBe("Hi Alice. Would you be open to a chat?");
  });

  it("drops a mustache-style placeholder sentence", async () => {
    const { scrubPlaceholders } = await import("./scrub");
    const input =
      "Dear {{name}}. I'd love to connect. My background is in ML systems.";
    const out = scrubPlaceholders(input);
    expect(out).toBe("I'd love to connect. My background is in ML systems.");
  });

  it("leaves clean prose untouched", async () => {
    const { scrubPlaceholders } = await import("./scrub");
    const clean =
      "Hi Alice. I'm a junior at USC. I'd love 15 minutes to discuss research.";
    expect(scrubPlaceholders(clean)).toBe(clean);
  });

  it("preserves paragraph breaks", async () => {
    const { scrubPlaceholders } = await import("./scrub");
    const input =
      "Hi Alice,\n\nI admire your work. My name is Steve.\n\nI have been following your [specific paper]. Would you have time?";
    const out = scrubPlaceholders(input);
    expect(out).toBe(
      "Hi Alice,\n\nI admire your work. My name is Steve.\n\nWould you have time?",
    );
  });

  it("does NOT strip legitimate short all-caps acronyms", async () => {
    const { scrubPlaceholders } = await import("./scrub");
    const input = "I work on NLP and [AI]. My project is at [MIT]. Hi.";
    // [AI] and [MIT] are pure all-caps single tokens — kept.
    expect(scrubPlaceholders(input)).toBe(input);
  });
});
