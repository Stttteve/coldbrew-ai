/**
 * Gmail thread fetching + reply detection.
 *
 * We treat an "incoming reply" as any message on the thread whose Gmail
 * label set does not contain `SENT` (i.e. not authored by the connected
 * mailbox). This is more reliable than parsing the From header, which
 * can vary for aliases/display-names.
 */

const GMAIL_THREADS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads";

type GmailHeader = { name: string; value: string };

type GmailMessage = {
  id: string;
  internalDate?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
  };
};

type GmailThread = {
  id: string;
  messages?: GmailMessage[];
};

export type ThreadReplySummary = {
  threadId: string;
  replyCount: number;
  lastReplyAt: Date | null;
  lastReplyFrom: string | null;
  lastReplySnippet: string | null;
  firstReplyAt: Date | null;
};

export async function fetchGmailThread(
  accessToken: string,
  threadId: string,
): Promise<GmailThread | null> {
  const url = `${GMAIL_THREADS_URL}/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Date`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Gmail threads.get failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as GmailThread;
}

function headerValue(msg: GmailMessage, name: string): string | null {
  const h = msg.payload?.headers?.find(
    (x) => x.name.toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? null;
}

export function summarizeReplies(thread: GmailThread): ThreadReplySummary {
  const replies = (thread.messages ?? []).filter((m) => {
    const labels = m.labelIds ?? [];
    return !labels.includes("SENT") && !labels.includes("DRAFT");
  });

  const sorted = replies
    .map((m) => ({
      msg: m,
      ts: m.internalDate ? Number(m.internalDate) : NaN,
    }))
    .filter((x) => Number.isFinite(x.ts))
    .sort((a, b) => a.ts - b.ts);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return {
    threadId: thread.id,
    replyCount: replies.length,
    firstReplyAt: first ? new Date(first.ts) : null,
    lastReplyAt: last ? new Date(last.ts) : null,
    lastReplyFrom: last ? headerValue(last.msg, "From") : null,
    lastReplySnippet: last?.msg.snippet?.slice(0, 280) ?? null,
  };
}
