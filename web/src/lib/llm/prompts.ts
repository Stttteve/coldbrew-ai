import { PURPOSE_CATEGORIES, PURPOSE_LABEL, PURPOSE_LENGTH } from "./schemas";

/**
 * Prompt templates. Kept in one file so diffing them on a model change is
 * trivial, and so that we can version-tag them per project row later.
 */

export const BRIEFING_PROMPT_VERSION = "v1.0.0";
export const DRAFT_PROMPT_VERSION = "v1.0.0";

function taxonomyBlock(): string {
  return PURPOSE_CATEGORIES.map(
    (k) =>
      `  - ${k}: ${PURPOSE_LABEL[k]} (target length: ${
        PURPOSE_LENGTH[k][0]
      }–${PURPOSE_LENGTH[k][1]} words)`,
  ).join("\n");
}

/**
 * System prompt for the briefing interviewer. Short, directive, and ends with
 * the exact marker format the extraction code looks for.
 */
export const BRIEFING_SYSTEM_PROMPT = `You are an interviewer helping a user prepare a cold-email outreach project.

Your job is to collect a structured briefing by asking AT MOST THREE short
clarifying questions, one per turn. Prefer silence to a wasted question: if a
field is already inferable from the conversation, do not ask about it.

Required fields:
  - purpose_category  — choose from the taxonomy below
  - sender_role       — a one-line description of who is sending the email
  - specific_ask      — what each email asks the recipient to do
  - tone              — one of: formal, semi_formal, casual
  - length_target     — integer word count (use the taxonomy's range)
  - must_mention      — short bullets the user wants in every email
                       (CV link, GitHub, availability, etc.); may be empty
  - signoff_style     — optional sign-off preference
  - sender_intro      — optional 1–3 sentences the sender wants woven into
                       each email (background, credibility, voice)

Taxonomy of purposes:
${taxonomyBlock()}

When, and ONLY when, every required field is present or the user explicitly
says "done", output ONE final message whose ENTIRE content is a fenced JSON
block of the form:

<briefing_json>
{
  "purpose_category": "...",
  "sender_role": "...",
  "specific_ask": "...",
  "tone": "...",
  "length_target": 150,
  "must_mention": [],
  "signoff_style": "...",
  "sender_intro": "optional short self-intro for the model"
}
</briefing_json>

Do not include any other text in that final message. Until you emit that
block, keep the conversation friendly, concise, and focused.`;

export const BRIEFING_GREETING =
  "Hi! I'll help you prep a cold-email outreach project. In a sentence or two, who are you writing to and what do you want out of it?";

/**
 * Draft writer prompt, assembled per-recipient. We keep it in one template
 * string with explicit sentinels so it's easy to read and diff.
 */
export function buildDraftPrompt(params: {
  briefing: {
    purpose_category: string;
    sender_role: string;
    sender_intro?: string;
    specific_ask: string;
    tone: string;
    length_target: number;
    must_mention: string[];
    signoff_style?: string;
  };
  /** Saved info-briefing chat transcript — extra colour alongside the briefing summary. */
  briefingConversationContext?: string | null;
  recipient: {
    name?: string | null;
    title?: string | null;
    organization?: string | null;
    one_liner?: string | null;
    linkedin_summary?: string | null;
  };
  senderSignature?: string | null;
}): string {
  const r = params.recipient;
  const b = params.briefing;
  const hasAnyFact =
    r.title || r.organization || r.one_liner || r.linkedin_summary;
  const sig = params.senderSignature?.trim();

  const signatureBlock = sig
    ? `Sender signature (for tone only — the app stores this separately and appends it when sending; do NOT put it in the JSON "body"):\n${sig}\n\n  End "body" with your last sentence or a short closing like "Thanks," or "Best," only — no name block, no title lines, no repeating the lines above.`
    : // When the sender has NOT configured a signature, we must stop the model
      // from inventing bracketed placeholders like "[Your Name]" — a major
      // quality issue. Instead, a neutral one-word sign-off is used.
      `Sender signature:
  The sender has NOT provided a signature. End the body with a single
  short sign-off ONLY (e.g. "Thanks,", "Best,", "Sincerely,") and NOTHING
  after it — no name, no brackets, no placeholders. The user will type
  their name in Gmail before sending.`;

  const intro = b.sender_intro?.trim();
  const introBlock = intro
    ? `Sender self-intro (optional — pick 1–2 relevant facts and weave them naturally into the email; do not dump verbatim; no brackets):\n${intro}\n`
    : "";

  const convo = params.briefingConversationContext?.trim();
  const convoBlock = convo
    ? `Info briefing transcript (extra details the user told the interviewer — use only facts that are consistent with the briefing summary above; do not contradict it; do not invent; ignore any bracketed "fill this later" hints from the model side):\n${convo}\n\n`
    : "";

  return `Write a cold email from the user to the recipient below.

Briefing
  Purpose: ${b.purpose_category}
  Sender role: ${b.sender_role}
${introBlock}  Specific ask: ${b.specific_ask}
  Tone: ${b.tone}
  Target length: ${b.length_target} words (±30%)
  Must mention: ${b.must_mention.length ? b.must_mention.join("; ") : "(nothing required)"}
  Sign-off: ${b.signoff_style ?? "(user default)"}

${convoBlock}Recipient profile (ONLY reference facts that appear below — do NOT invent details)
  Name: ${r.name ?? "(unknown)"}
  Title: ${r.title ?? "(unknown)"}
  Organization: ${r.organization ?? "(unknown)"}
  One-liner: ${r.one_liner ?? "(none)"}
  Profile / web summary: ${r.linkedin_summary ?? "(none)"}

${signatureBlock}

Output rules
  - In "body", use normal prose: at most 2–4 short paragraphs, separated by ONE
    blank line (\\n\\n) only between major ideas. Do NOT put a line break after
    every sentence — sentences in the same thought should stay on continuous
    lines (wrap is fine). Avoid a blank line between each sentence.
  - Return ONLY a JSON object matching this schema:
    {
      "subject":          string (<= 120 chars),
      "body":             string (plain text, <= 4000 chars, word count within target ±30%),
      "referenced_facts": string[] (facts from the recipient profile you actually used),
      "word_count":       integer,
      "confidence":       number in [0, 1]
    }
  - If no recipient facts are available${hasAnyFact ? " (not the case here)" : ""}, write a general message. Do NOT invent facts.
  - ABSOLUTELY NO placeholder tokens anywhere in the body. This means NO
    "[Your Name]", NO "[GitHub Link]", NO "{company}", NO "[insert …]",
    NO "[mention a specific paper]" or any other bracketed hint telling
    the sender to fill something in later.
  - If the recipient profile doesn't contain a specific paper or area of
    research, fall back to their TITLE and ORGANIZATION. E.g. instead of
    "I am impressed by your work on [specific paper]", write something
    like "I am drawn to your research as a ${r.title ? "`" + r.title + "`" : "professor"} at ${r.organization ? "`" + r.organization + "`" : "your institution"}". A slightly more generic
    sentence is FAR better than a bracketed placeholder.
  - Do NOT wrap the JSON in markdown fences — output raw JSON.`;
}
