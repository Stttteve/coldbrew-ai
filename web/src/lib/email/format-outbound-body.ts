/**
 * Cold email bodies from the LLM often use a newline after every sentence.
 * In multipart text/plain + Gmail mobile, that reads as one paragraph per
 * line. We normalize before MIME build: keep intentional blank-line breaks
 * as paragraphs, but merge hard line breaks inside a paragraph into spaces.
 */

export function normalizePlainTextForOutboundEmail(body: string): string {
  const t = body.trim().replace(/\r\n/g, "\n");
  if (!t) return "";
  const chunks = t.split(/\n\n+/);
  return chunks
    .map((chunk) =>
      chunk
        .replace(/\n+/g, " ")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Simple HTML part so clients prefer a flowing layout over raw text/plain
 * line breaks. One <p> per paragraph (split on blank lines after normalize).
 */
export function plainTextToHtmlEmailFragment(normalizedPlain: string): string {
  const parts = normalizedPlain.split(/\n\n+/).filter(Boolean);
  const inner = parts
    .map((p, i) => {
      const margin =
        i === parts.length - 1 ? "margin:0" : "margin:0 0 14px 0";
      return `<p style="${margin};line-height:1.55;">${escapeHtml(p)}</p>`;
    })
    .join("");
  return `<div style="font-size:16px;color:#202124;font-family:Roboto,Helvetica,Arial,sans-serif;">${inner}</div>`;
}
