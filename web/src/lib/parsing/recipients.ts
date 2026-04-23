/**
 * Recipient input parser.
 *
 * Accepts five shapes per line:
 *   1. email                          →  { email }
 *   2. "Name <email>"                 →  { name, email }
 *   3. "Name" <email>                 →  same
 *   4. LinkedIn URL                   →  { linkedinUrl }
 *   5. bare name                      →  { name }
 *
 * Lines are trimmed; blank lines are dropped. Unparseable lines come back
 * as `{ raw, error }` so the UI can highlight them without discarding input.
 *
 * The parser is intentionally permissive — over-acceptance is fine because
 * enrichment will flag low-confidence rows. The server re-validates with
 * Zod before persisting.
 */

export interface ParsedRecipient {
  raw: string;
  email?: string;
  name?: string;
  linkedinUrl?: string;
  error?: string;
}

// RFC 5322 lite — good enough for mainstream addresses. Paranoia is outsourced
// to the enrichment layer where invalids surface naturally.
const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const NAME_BRACKETS_RE =
  /^\s*"?([^"<>]+?)"?\s*<\s*([^<>@\s]+@[^<>@\s]+\.[A-Za-z]{2,})\s*>\s*$/;
const LINKEDIN_RE = /^https?:\/\/(www\.)?linkedin\.com\/(in|pub)\/[\w\-%/.]+\/?(\?.*)?$/i;

/** True when the URL is a LinkedIn /in or /pub profile (Proxycurl-compatible). */
export function isLinkedInProfileUrl(url: string): boolean {
  return LINKEDIN_RE.test(url.trim());
}

export function parseRecipientLine(line: string): ParsedRecipient {
  const raw = line.trim();
  if (!raw) return { raw, error: "blank" };

  if (LINKEDIN_RE.test(raw)) {
    return { raw, linkedinUrl: normaliseLinkedin(raw) };
  }
  const webProfile = tryParseReadableWebUrl(raw);
  if (webProfile) {
    return { raw, linkedinUrl: webProfile };
  }
  if (EMAIL_RE.test(raw)) {
    return { raw, email: raw.toLowerCase() };
  }
  const br = raw.match(NAME_BRACKETS_RE);
  if (br) {
    const [, name, email] = br;
    return { raw, name: name.trim(), email: email.toLowerCase() };
  }

  // Does it contain an @ at all? If so, treat as best-effort email extraction.
  const atIdx = raw.indexOf("@");
  if (atIdx > -1) {
    // Sweep typical "Name email@x.com" format without angle brackets.
    const tokens = raw.split(/\s+/);
    const maybeEmail = tokens.find((t) => EMAIL_RE.test(t));
    if (maybeEmail) {
      const name = tokens
        .filter((t) => t !== maybeEmail)
        .join(" ")
        .trim();
      return {
        raw,
        email: maybeEmail.toLowerCase(),
        name: name || undefined,
      };
    }
    return { raw, error: "looks_like_email_but_invalid" };
  }

  // Fallback: bare name. Require at least 2 alpha characters so we don't
  // accept random garbage.
  if (/[A-Za-z]{2,}/.test(raw)) {
    return { raw, name: raw };
  }
  return { raw, error: "unrecognised" };
}

export function parseRecipientBlock(text: string): ParsedRecipient[] {
  return text
    .split(/\r?\n/)
    .map((l) => parseRecipientLine(l))
    .filter((r) => r.error !== "blank");
}

/**
 * Very small CSV parser — enough for human-authored exports without pulling
 * in a full RFC 4180 library. We accept:
 *   - optional double-quoted fields (with escaped "" inside)
 *   - comma, semicolon, or tab as delimiter (auto-detected by header line)
 *   - Unix / Windows line endings
 */
export interface CsvRow {
  email?: string;
  name?: string;
  title?: string;
  organization?: string;
  linkedinUrl?: string;
  notes?: string;
  _error?: string;
}

const HEADER_ALIASES: Record<string, keyof CsvRow> = {
  email: "email",
  "email address": "email",
  "e-mail": "email",
  name: "name",
  "full name": "name",
  title: "title",
  role: "title",
  "job title": "title",
  organization: "organization",
  organisation: "organization",
  company: "organization",
  employer: "organization",
  linkedin: "linkedinUrl",
  "linkedin_url": "linkedinUrl",
  "linkedin url": "linkedinUrl",
  profile_url: "linkedinUrl",
  url: "linkedinUrl",
  "profile url": "linkedinUrl",
  website: "linkedinUrl",
  notes: "notes",
};

export function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length);
  if (lines.length === 0) return [];

  const delim = detectDelim(lines[0]);
  const header = splitCsvLine(lines[0], delim).map((h) =>
    h.trim().toLowerCase(),
  );
  const colMap = header.map((h) => HEADER_ALIASES[h] ?? null);

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delim);
    const row: CsvRow = {};
    for (let j = 0; j < cols.length && j < colMap.length; j++) {
      const key = colMap[j];
      if (!key) continue;
      const v = cols[j]?.trim();
      if (!v) continue;
      row[key] = v;
    }
    if (row.email && !EMAIL_RE.test(row.email)) {
      row._error = "invalid_email";
    }
    rows.push(row);
  }
  return rows;
}

// ---- internals ----

function detectDelim(headerLine: string): string {
  const counts = [",", ";", "\t"].map((d) => [d, (headerLine.match(new RegExp(`\\${d}`, "g")) ?? []).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normaliseLinkedin(url: string): string {
  // strip trailing slash + query, keep scheme://host/in/slug
  const u = new URL(url);
  const pathname = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${pathname}`;
}

/** Any http(s) URL with a host — stored in `linkedinUrl` column for history. */
function tryParseReadableWebUrl(raw: string): string | null {
  const t = raw.trim();
  if (!/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.hostname.length < 2) return null;
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "") || "";
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return null;
  }
}
