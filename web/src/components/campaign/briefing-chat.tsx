"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BRIEFING_GREETING } from "@/lib/llm/prompts";
import type { Briefing } from "@/lib/llm/schemas";
import { stripBriefingBlock } from "@/lib/llm/briefing-extract";

/**
 * Client chat UI for the briefing interviewer.
 *
 * We stream assistant replies via SSE (`EventSource` doesn't support POST
 * bodies, so we use `fetch` + ReadableStream reader — works in all modern
 * browsers). Conversation history lives entirely client-side; the server is
 * stateless. When the server emits an `event: briefing` frame with the
 * extracted JSON, we bubble it up to the parent.
 */

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** set true once streaming for this message is complete */
  done: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function BriefingChat({
  projectId,
  initialBriefing,
  onBriefingExtracted,
}: {
  projectId: string;
  initialBriefing: Briefing | null;
  onBriefingExtracted: (b: Briefing) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>(() =>
    initialBriefing
      ? [
          {
            id: uid(),
            role: "assistant",
            content:
              "Your brief is saved. You can keep chatting to refine it, or edit the briefing summary below.",
            done: true,
          },
        ]
      : [
          {
            id: uid(),
            role: "assistant",
            content: BRIEFING_GREETING,
            done: true,
          },
        ],
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const userMsg: Msg = { id: uid(), role: "user", content: text, done: true };
    const asstMsg: Msg = { id: uid(), role: "assistant", content: "", done: false };
    const convoForServer = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/campaigns/${projectId}/briefing/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: convoForServer }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        patchAssistant(asstMsg.id, "Sorry — I couldn't reach the assistant. Try again in a moment.", true);
        return;
      }
      await consumeSse(res.body, (frame) => {
        const d = frame.data;
        if (frame.event === "token" && typeof d.text === "string") {
          appendAssistant(asstMsg.id, d.text);
        } else if (frame.event === "briefing" && d.briefing) {
          onBriefingExtracted(d.briefing as Briefing);
        } else if (frame.event === "end") {
          finalizeAssistant(asstMsg.id);
        } else if (frame.event === "error") {
          const msg = typeof d.message === "string" ? d.message : "stream error";
          patchAssistant(asstMsg.id, `⚠️ ${msg}`, true);
        }
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        patchAssistant(asstMsg.id, `⚠️ ${(e as Error).message}`, true);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function appendAssistant(id: string, delta: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, content: m.content + delta } : m,
      ),
    );
  }
  function patchAssistant(id: string, content: string, done: boolean) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content, done } : m)),
    );
  }
  function finalizeAssistant(id: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, content: stripBriefingBlock(m.content) || m.content, done: true }
          : m,
      ),
    );
  }

  return (
    <Card className="flex h-[520px] flex-col">
      <CardHeader>
        <CardTitle className="text-lg">Info briefing</CardTitle>
        <CardDescription className="text-xs">
          What you type here is saved on the project and read alongside your
          briefing summary when drafts are generated.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div
          ref={scrollerRef}
          className="flex-1 space-y-3 overflow-y-auto pr-1"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-amber-600 px-4 py-2 text-sm text-white"
                  : "mr-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border bg-white px-4 py-2 text-sm"
              }
            >
              {m.content || (m.done ? "" : "…")}
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <Input
            placeholder={
              streaming ? "Thinking…" : "Reply, or type 'done' to finalise"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
          />
          <Button
            type="submit"
            variant="accent"
            disabled={streaming || !input.trim()}
          >
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Parses an SSE stream from a fetch body. Each event is invoked on the
 * callback with `{ event, data }` where `data` is the JSON-decoded payload.
 */
async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: { event?: string; data: Record<string, unknown> }) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawFrame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event: string | undefined;
      let data = "";
      for (const line of rawFrame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) {
        try {
          onFrame({ event, data: JSON.parse(data) });
        } catch {
          /* ignore malformed frame */
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}
