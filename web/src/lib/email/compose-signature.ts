/**
 * Default signature lives on User.defaultSignature. The LLM used to be asked
 * to paste it into the body, while the UI also appended it for preview — two
 * copies. We keep the body free of the configured block and append once
 * for preview + MIME, and strip any trailing duplicate from legacy/model output.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize for fuzzy "does body already end with this signature?" */
function normalizeLoose(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t\n]+/g, " ").trim().toLowerCase();
}

export function bodyAlreadyHasSignatureSuffix(
  body: string,
  signature: string | null | undefined,
): boolean {
  const sig = signature?.trim();
  if (!sig) return false;
  const b = body.trim();
  if (!b) return false;
  return normalizeLoose(b).endsWith(normalizeLoose(sig));
}

/**
 * Remove one trailing copy of the configured signature after a paragraph
 * break (`\\n\\n`). Requires that break so we never strip a name that appears
 * in the last sentence (e.g. "say hi to Steven" vs sig "Steven").
 */
export function stripTrailingConfiguredSignature(
  body: string,
  signature: string | null | undefined,
): string {
  const sig = signature?.trim();
  if (!sig) return body;
  const t = body.replace(/\r\n/g, "\n").trimEnd();
  const escaped = escapeRegExp(sig);
  const re = new RegExp(`\\n\\n(?:[ \\t]*\\n)*${escaped}\\s*$`, "i");
  const next = t.replace(re, "").trimEnd();
  if (!next) return body.trimEnd();
  return next;
}

/** Body + signature for preview or outbound text, never duplicated. */
export function withAppendedSignature(
  body: string,
  signature: string | null | undefined,
): string {
  const core = body.trim();
  const sig = signature?.trim() ?? "";
  if (!sig) return core;
  if (!core) return sig;
  if (bodyAlreadyHasSignatureSuffix(core, sig)) return core;
  return `${core}\n\n${sig}`;
}
