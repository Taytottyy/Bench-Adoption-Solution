"use client";

import { useState } from "react";
import AdoptForm from "./AdoptForm";
import MessageForm from "./MessageForm";
import {
  STATUS_META,
  benchPath,
  formatDate,
  lastDay,
  photoUrl,
  todayISO,
  type Bench,
} from "@/lib/benches";

export default function BenchPanel({
  bench,
  onClose,
  onSubmitted,
}: {
  bench: Bench;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [mode, setMode] = useState<"view" | "adopt" | "message">("view");
  const meta = STATUS_META[bench.status];
  const adoptable = bench.status !== "unavailable" && bench.status !== "unsurveyed";
  const future = bench.adopted_from && bench.adopted_from > todayISO();

  return (
    <aside className="pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-500">{bench.area ?? "Van Cortlandt Park"}</p>
          <h2 className="text-lg font-semibold">Bench {bench.code}</h2>
          <span
            className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
            style={{ backgroundColor: meta.color }}
          >
            {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ShareButton bench={bench} />
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </header>

      <div className="overflow-y-auto p-4">
        {mode === "adopt" ? (
          <AdoptForm bench={bench} onCancel={() => setMode("view")} onSubmitted={onSubmitted} />
        ) : mode === "message" ? (
          <MessageForm bench={bench} onCancel={() => setMode("view")} />
        ) : (
          <div className="space-y-4">
            {bench.photo_path && (
              // eslint-disable-next-line @next/next/no-img-element -- remote Supabase image
              <img src={photoUrl(bench.photo_path)} alt={`Bench ${bench.code}`} className="h-40 w-full rounded-lg object-cover" />
            )}

            {bench.status === "adopted" && (
              <dl className="space-y-2 text-sm">
                <Row term="Adopted by" value={bench.donor_name} />
                {bench.honoree && <Row term="In honor of" value={bench.honoree} />}
                {bench.plaque_text && <Row term="Plaque" value={`“${bench.plaque_text}”`} />}
                <Row
                  term="Term"
                  value={`${future ? "Starts " : ""}${formatDate(bench.adopted_from)} – ${lastDay(bench.adopted_until)}`}
                />
              </dl>
            )}
            {bench.status === "pending" && (
              <p className="text-sm text-stone-700">Someone has requested this bench and park staff are reviewing it.</p>
            )}
            {bench.status === "available" && (
              <p className="text-sm text-stone-700">This bench is available to adopt.</p>
            )}
            {bench.status === "unavailable" && (
              <p className="text-sm text-stone-700">This bench isn&apos;t open for adoption right now.</p>
            )}
            {bench.status === "unsurveyed" && (
              <p className="text-sm text-stone-700">This bench hasn&apos;t been surveyed yet, so it can&apos;t be adopted.</p>
            )}
            {bench.notes && <p className="text-sm text-stone-500">{bench.notes}</p>}

            {adoptable && (
              <div>
                <button
                  onClick={() => setMode("adopt")}
                  className="w-full rounded-lg bg-green-800 py-2.5 text-sm font-semibold text-white hover:bg-green-900"
                >
                  {bench.status === "available" ? "Adopt this bench" : "Request the next term"}
                </button>
                {bench.status !== "available" && bench.available_on && (
                  <p className="mt-1.5 text-center text-xs text-stone-500">
                    Next available {formatDate(bench.available_on)}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => setMode("message")}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 7h3l2-3h6l2 3h3v12H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              Send photos or a message
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function Row({ term, value }: { term: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2">
      <dt className="text-stone-500">{term}</dt>
      <dd className="font-medium text-stone-900">{value}</dd>
    </div>
  );
}

function ShareButton({ bench }: { bench: Bench }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(benchPath(bench.code), window.location.origin).href;
    const title = `Bench ${bench.code} · Van Cortlandt Park`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // dismissed
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={share}
      className="rounded-full px-2.5 py-1.5 text-xs font-medium text-green-800 hover:bg-green-50"
      aria-label="Share link to this bench"
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
