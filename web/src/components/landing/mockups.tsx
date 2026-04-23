"use client";

import { useEffect, useRef, useState } from "react";

function useInViewOnce<T extends HTMLElement>(threshold = 0.35) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const n = ref.current;
    if (!n) return;
    const o = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          o.disconnect();
        }
      },
      { threshold },
    );
    o.observe(n);
    return () => o.disconnect();
  }, [threshold]);
  return { ref, seen };
}

function Browser({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-xl shadow-amber-900/5 ring-1 ring-black/5">
      <div className="flex items-center gap-1.5 border-b bg-zinc-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </div>
      {children}
    </div>
  );
}

export function ConnectGmailMockup() {
  const { ref, seen } = useInViewOnce<HTMLDivElement>();
  return (
    <div ref={ref}>
      <Browser>
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-5 p-10">
          <div className="text-sm font-medium text-muted-foreground">
            Connect your inbox
          </div>
          <button
            className={`flex items-center gap-3 rounded-lg border bg-white px-5 py-3 text-sm font-medium shadow-sm transition-all duration-500 ${
              seen ? "scale-95 border-emerald-300 bg-emerald-50" : ""
            }`}
          >
            <span className="text-lg">✉️</span>
            <span>Continue with Gmail</span>
            {seen && (
              <span className="ml-2 text-emerald-600 animate-[fadeIn_400ms_ease-out_600ms_both]">
                ✓
              </span>
            )}
          </button>
          <div
            className={`text-xs text-emerald-700 transition-opacity duration-500 ${
              seen ? "opacity-100 delay-[900ms]" : "opacity-0"
            }`}
          >
            Connected as you@company.com
          </div>
        </div>
      </Browser>
    </div>
  );
}

const RECIPIENTS = [
  { name: "Alex Chen", role: "Head of Product · Acme", avatar: "AC" },
  { name: "Priya Shah", role: "VP Eng · Northwind", avatar: "PS" },
  { name: "Jordan Park", role: "Founder · Tidepool", avatar: "JP" },
  { name: "Mia Okafor", role: "Growth Lead · Sunroof", avatar: "MO" },
  { name: "Tom Riley", role: "COO · Halcyon", avatar: "TR" },
];

export function RecipientsMockup() {
  const { ref, seen } = useInViewOnce<HTMLDivElement>();
  return (
    <div ref={ref}>
      <Browser>
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Recipients · 5 researched</span>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
              enriched
            </span>
          </div>
          <div className="space-y-2">
            {RECIPIENTS.map((r, i) => (
              <div
                key={r.name}
                className={`flex items-center gap-3 rounded-lg border bg-white p-3 transition-all duration-500 ${
                  seen
                    ? "translate-x-0 opacity-100"
                    : "-translate-x-4 opacity-0"
                }`}
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-900">
                  {r.avatar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.role}
                  </div>
                </div>
                <span
                  className="text-xs text-emerald-600 transition-opacity duration-300"
                  style={{
                    transitionDelay: `${i * 120 + 400}ms`,
                    opacity: seen ? 1 : 0,
                  }}
                >
                  ✓
                </span>
              </div>
            ))}
          </div>
        </div>
      </Browser>
    </div>
  );
}

const DRAFT_TEXT = `Hi Alex,

I saw Acme just shipped your new onboarding flow — the empty-state copy is genuinely charming, which is rare.

We help product teams turn cold intros like this into warm replies without the usual spam-y feel. Worth a 15-min chat next week?

— Steven`;

export function DraftingMockup() {
  const { ref, seen } = useInViewOnce<HTMLDivElement>();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!seen) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(DRAFT_TEXT.slice(0, i));
      if (i >= DRAFT_TEXT.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [seen]);

  return (
    <div ref={ref}>
      <Browser>
        <div className="grid grid-cols-[1fr_1.4fr]">
          <div className="border-r bg-zinc-50/60 p-4 text-xs">
            <div className="mb-2 font-semibold text-zinc-700">Context</div>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>• Recent launch: onboarding v2</li>
              <li>• LinkedIn: 6 yrs at Acme</li>
              <li>• Tone: friendly, concise</li>
              <li>• Mutual: Priya Shah</li>
            </ul>
          </div>
          <div className="p-5">
            <div className="mb-3 border-b pb-2 text-xs text-muted-foreground">
              To: alex@acme.co · <span className="text-amber-700">Draft</span>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-zinc-800">
              {typed}
              <span className="ml-[1px] inline-block h-4 w-[2px] animate-pulse bg-amber-600 align-middle" />
            </pre>
          </div>
        </div>
      </Browser>
    </div>
  );
}

export function DashboardMockup() {
  const { ref, seen } = useInViewOnce<HTMLDivElement>();
  const stats = [
    { label: "Drafts ready", value: 24, color: "amber" },
    { label: "Sent", value: 18, color: "zinc" },
    { label: "Replies", value: 7, color: "emerald" },
  ];
  return (
    <div ref={ref}>
      <Browser>
        <div className="p-5">
          <div className="mb-4 text-sm font-semibold">Q2 partnership push</div>
          <div className="mb-5 grid grid-cols-3 gap-3">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={`rounded-lg border p-3 transition-all duration-500 ${
                  seen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
                }`}
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div
                  className={`mt-1 text-2xl font-semibold ${
                    s.color === "amber"
                      ? "text-amber-700"
                      : s.color === "emerald"
                        ? "text-emerald-600"
                        : "text-zinc-900"
                  }`}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {[
              { who: "Alex Chen", status: "Replied", tone: "emerald" },
              { who: "Priya Shah", status: "Opened", tone: "amber" },
              { who: "Jordan Park", status: "Sent", tone: "zinc" },
            ].map((row, i) => (
              <div
                key={row.who}
                className={`flex items-center justify-between rounded-lg border bg-white px-3 py-2.5 text-sm transition-all duration-500 ${
                  seen ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0"
                }`}
                style={{ transitionDelay: `${400 + i * 120}ms` }}
              >
                <span>{row.who}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    row.tone === "emerald"
                      ? "bg-emerald-50 text-emerald-700"
                      : row.tone === "amber"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Browser>
    </div>
  );
}
