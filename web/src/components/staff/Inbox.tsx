"use client";

import { useEffect, useMemo, useState } from "react";
import { benchPath, formatDate } from "@/lib/benches";
import {
  TOPICS,
  TOPIC_LABEL,
  publishAsBenchPhoto,
  signedPhotoUrls,
  updateSubmission,
  type Submission,
  type SubmissionStatus,
  type SubmissionTopic,
} from "@/lib/submissions";
import type { StaffData } from "./StaffApp";

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
};
const STATUS_STYLE: Record<SubmissionStatus, string> = {
  new: "bg-orange-50 text-orange-800",
  in_progress: "bg-sky-50 text-sky-800",
  resolved: "bg-stone-100 text-stone-600",
};
const TOPIC_STYLE: Record<SubmissionTopic, string> = {
  bench_photo: "bg-green-50 text-green-800",
  plaque: "bg-violet-50 text-violet-800",
  damage: "bg-red-50 text-red-800",
  question: "bg-stone-100 text-stone-700",
};

type StatusFilter = "open" | SubmissionStatus | "all";

export default function Inbox({ data, reload }: { data: StaffData; reload: () => Promise<void> }) {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [topic, setTopic] = useState<SubmissionTopic | "all">("all");
  const [query, setQuery] = useState("");
  const [urls, setUrls] = useState<Record<string, string> | null>(null);

  // Private photos: fetch short-lived links for everything loaded.
  const allPaths = useMemo(() => data.submissions.flatMap((s) => s.photo_paths), [data.submissions]);
  useEffect(() => {
    signedPhotoUrls(allPaths)
      .then(setUrls)
      .catch(() => setUrls({}));
  }, [allPaths]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.submissions.filter(
      (s) =>
        (status === "all" ||
          (status === "open" ? s.status !== "resolved" : s.status === status)) &&
        (topic === "all" || s.topic === topic) &&
        (!q ||
          [s.benches?.code, s.contact_name, s.contact_email, s.message].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [data.submissions, status, topic, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
          aria-label="Filter by status"
        >
          <option value="open">Open (new + in progress)</option>
          <option value="new">New</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value as SubmissionTopic | "all")}
          className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
          aria-label="Filter by topic"
        >
          <option value="all">All topics</option>
          {TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bench, name, email, message"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm sm:max-w-sm"
        />
        <span className="text-sm text-stone-500">{rows.length} shown</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-sm text-stone-500 shadow-sm">
          {data.submissions.length === 0
            ? "No photos or messages yet. Visitors can send them from any bench on the public map."
            : "Nothing matches these filters."}
        </p>
      ) : (
        rows.map((s) => <SubmissionCard key={s.id} submission={s} urls={urls} data={data} reload={reload} />)
      )}
    </div>
  );
}

function SubmissionCard({
  submission: s,
  urls,
  data,
  reload,
}: {
  submission: Submission;
  urls: Record<string, string> | null; // null while loading
  data: StaffData;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bench = data.records.find((b) => b.id === s.bench_id);
  const code = s.benches?.code ?? "";

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const subject = `Re: Bench ${code} (${TOPIC_LABEL[s.topic]})`;
  const quoted = s.message ? `\n\n---\nOn ${formatDate(s.created_at.slice(0, 10))} you wrote:\n${s.message}` : "";
  const mailto = `mailto:${s.contact_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    `Hi ${s.contact_name},\n\n${quoted}`,
  )}`;

  return (
    <article className={`rounded-xl bg-white p-4 shadow-sm ${s.status === "resolved" ? "opacity-75" : ""}`}>
      <header className="flex flex-wrap items-center gap-2">
        <a href={benchPath(code)} target="_blank" className="font-semibold hover:underline">
          Bench {code}
        </a>
        <span className="text-sm text-stone-500">{s.benches?.area}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TOPIC_STYLE[s.topic]}`}>{TOPIC_LABEL[s.topic]}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
        <span className="ml-auto text-xs text-stone-500">
          {new Date(s.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </header>

      <p className="mt-2 text-sm">
        <span className="font-medium">{s.contact_name}</span>{" "}
        <a href={`mailto:${s.contact_email}`} className="text-green-800 hover:underline">
          {s.contact_email}
        </a>
      </p>
      {s.message && <p className="mt-2 whitespace-pre-line text-sm text-stone-800">{s.message}</p>}

      {s.photo_paths.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {s.photo_paths.map((path) => (
            <figure key={path} className="w-32">
              {urls?.[path] ? (
                <a href={urls[path]} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed private image */}
                  <img src={urls[path]} alt={`Photo from ${s.contact_name}`} className="h-24 w-32 rounded-md object-cover" />
                </a>
              ) : urls === null ? (
                <div className="h-24 w-32 animate-pulse rounded-md bg-stone-100" />
              ) : (
                <div className="flex h-24 w-32 items-center justify-center rounded-md bg-stone-100 text-xs text-stone-400">
                  Photo unavailable
                </div>
              )}
              {bench && urls?.[path] && (
                <figcaption>
                  <button
                    disabled={busy}
                    onClick={() =>
                      confirm(`Make this the public photo for bench ${code}?`) && run(() => publishAsBenchPhoto(bench, path))
                    }
                    className="mt-1 text-xs font-medium text-green-800 hover:underline disabled:opacity-50"
                  >
                    Use as bench photo
                  </button>
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-stone-100 pt-3 sm:flex-row sm:items-center">
        <input
          defaultValue={s.staff_notes ?? ""}
          disabled={busy}
          placeholder="Staff note (only staff see this)"
          onBlur={(e) => {
            const next = e.target.value.trim() || null;
            if (next !== s.staff_notes) run(() => updateSubmission(s.id, { staff_notes: next }));
          }}
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
          aria-label="Staff note"
        />
        <div className="flex items-center gap-2">
          <a href={mailto} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-50">
            Reply by email
          </a>
          <select
            value={s.status}
            disabled={busy}
            onChange={(e) => run(() => updateSubmission(s.id, { status: e.target.value as SubmissionStatus }))}
            className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Status"
          >
            {(Object.keys(STATUS_LABEL) as SubmissionStatus[]).map((st) => (
              <option key={st} value={st}>
                {STATUS_LABEL[st]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </article>
  );
}
