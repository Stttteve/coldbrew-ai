/**
 * Last-ditch post-processing to guarantee no placeholder tokens ever reach
 * the user's inbox, even if the model stubbornly ignores prompt instructions.
 *
 * Strategy:
 *   - If a sentence contains a bracketed hint (e.g. "[mention a paper]") or a
 *     mustache token (e.g. "{{name}}"), we DROP the whole sentence — not
 *     just the placeholder — because a sentence built around a placeholder
 *     reads as nonsense once the token is removed.
 *   - We keep paragraph breaks intact so the email still flows.
 *
 * This runs AFTER the validator has already complained. The validator
 * warns on the user side; this scrub silently cleans. Together they form
 * belt-and-braces protection.
 */

const BRACKET_HINT_RE = /\[\s*(?=[^\]]*(?:\s|[a-z]))[^\]]{2,60}\]/;
const MUSTACHE_RE = /\{\{?\s*[a-zA-Z_][\w.\-]*\s*\}?\}/;

function looksLikePlaceholder(sentence: string): boolean {
  return BRACKET_HINT_RE.test(sentence) || MUSTACHE_RE.test(sentence);
}

/**
 * Split a chunk of prose into sentences WITHOUT destroying the whitespace
 * between them — we need to be able to re-join perfectly. We walk the
 * string and split on ". ", "! ", "? " followed by a capital letter.
 *
 * This isn't perfect English sentence segmentation (it mishandles "Dr. Chen"
 * for instance) but for our purposes it's enough — the placeholder sentences
 * we need to kill are always full sentences, not mid-sentence abbreviations.
 */
function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < paragraph.length; i++) {
    buf += paragraph[i];
    const isSentenceEnd = /[.!?]/.test(paragraph[i]);
    const next = paragraph[i + 1];
    const nextNext = paragraph[i + 2];
    if (isSentenceEnd && next === " " && nextNext && /[A-Z]/.test(nextNext)) {
      // Boundary found; also swallow the trailing space.
      i++;
      buf += " ";
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Remove any sentence that still contains a placeholder token. Paragraph
 * breaks ("\n\n") are preserved so the email keeps its structure.
 */
export function scrubPlaceholders(body: string): string {
  const paragraphs = body.split(/\n{2,}/);
  const cleaned = paragraphs.map((p) =>
    splitSentences(p)
      .filter((s) => !looksLikePlaceholder(s))
      .join("")
      .trim(),
  );
  return cleaned.filter(Boolean).join("\n\n");
}
