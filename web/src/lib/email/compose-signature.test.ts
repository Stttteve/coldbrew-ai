import { describe, expect, it } from "vitest";

import {
  bodyAlreadyHasSignatureSuffix,
  stripTrailingConfiguredSignature,
  withAppendedSignature,
} from "./compose-signature";

describe("withAppendedSignature", () => {
  it("appends signature when absent", () => {
    expect(withAppendedSignature("Hello.\n\nThanks,", "Steven Zhou")).toBe(
      "Hello.\n\nThanks,\n\nSteven Zhou",
    );
  });

  it("does not append when body already ends with same signature", () => {
    const body = "Hi.\n\nThanks,\n\nSteven Zhou";
    expect(withAppendedSignature(body, "Steven Zhou")).toBe(body);
  });

  it("treats case-insensitive suffix as duplicate", () => {
    expect(withAppendedSignature("Line\n\nsteven zhou", "Steven Zhou")).toBe(
      "Line\n\nsteven zhou",
    );
  });
});

describe("stripTrailingConfiguredSignature", () => {
  it("removes trailing signature block", () => {
    expect(
      stripTrailingConfiguredSignature(
        "Hello.\n\nThanks,\n\nSteven Zhou",
        "Steven Zhou",
      ),
    ).toBe("Hello.\n\nThanks,");
  });

  it("no-ops when signature not at end", () => {
    expect(stripTrailingConfiguredSignature("Steven Zhou says hi", "Steven Zhou")).toBe(
      "Steven Zhou says hi",
    );
  });
});

describe("bodyAlreadyHasSignatureSuffix", () => {
  it("returns false for empty signature", () => {
    expect(bodyAlreadyHasSignatureSuffix("a", "")).toBe(false);
    expect(bodyAlreadyHasSignatureSuffix("a", null)).toBe(false);
  });
});
