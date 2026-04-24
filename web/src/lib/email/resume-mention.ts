/**
 * When a recipient gets the user's resume attached, we append a single
 * neutral sentence to the body so the reader knows the file is intentional
 * and what it is. We try not to duplicate: if the existing body already
 * mentions a resume / CV / portfolio, we leave it alone.
 *
 * The line is appended on preview + outbound only — we never persist it
 * to the stored draft body. This way toggling the "attach resume" option
 * on or off doesn't leave stale copy behind.
 */

const DEFAULT_RESUME_MENTION =
  "I've attached my resume for your reference.";

const ALREADY_MENTIONS_RESUME =
  /\b(attached|attaching)\b[^\n]{0,80}\b(resume|cv|portfolio|deck)\b/i;

export function withAppendedResumeMention(
  body: string,
  opts: { attachResume: boolean; hasResume: boolean },
): string {
  if (!opts.attachResume || !opts.hasResume) return body;
  if (!body.trim()) return DEFAULT_RESUME_MENTION;
  if (ALREADY_MENTIONS_RESUME.test(body)) return body;
  return `${body.trimEnd()}\n\n${DEFAULT_RESUME_MENTION}`;
}
