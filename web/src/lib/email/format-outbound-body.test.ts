import { describe, expect, it } from "vitest";

import {
  normalizePlainTextForOutboundEmail,
  plainTextToHtmlEmailFragment,
} from "./format-outbound-body";

describe("normalizePlainTextForOutboundEmail", () => {
  it("merges single newlines inside a stanza into spaces", () => {
    const raw = "Hi Alice,\nI hope you are well.\nI wanted to ask about your paper.";
    expect(normalizePlainTextForOutboundEmail(raw)).toBe(
      "Hi Alice, I hope you are well. I wanted to ask about your paper.",
    );
  });

  it("preserves blank-line paragraph boundaries", () => {
    const raw = "Hi Alice,\nHope you are well.\n\nWould Tuesday work for a quick call?\n\nThanks,";
    expect(normalizePlainTextForOutboundEmail(raw)).toBe(
      "Hi Alice, Hope you are well.\n\nWould Tuesday work for a quick call?\n\nThanks,",
    );
  });

  it("collapses 3+ newlines to a single paragraph break", () => {
    const raw = "A\n\n\nB";
    expect(normalizePlainTextForOutboundEmail(raw)).toBe("A\n\nB");
  });

  it("trims and normalizes CRLF", () => {
    expect(normalizePlainTextForOutboundEmail("  x\r\ny  ")).toBe("x y");
  });
});

describe("plainTextToHtmlEmailFragment", () => {
  it("escapes HTML and wraps paragraphs", () => {
    const html = plainTextToHtmlEmailFragment("a & b\n\nc < d");
    expect(html).toContain("a &amp; b");
    expect(html).toContain("c &lt; d");
    expect(html).toMatch(/<p[^>]*>a &amp; b<\/p>/);
    expect(html).toMatch(/<p[^>]*>c &lt; d<\/p>/);
  });
});
