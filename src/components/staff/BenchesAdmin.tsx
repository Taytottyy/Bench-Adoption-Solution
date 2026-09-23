"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { STATUS_META, benchPath, formatDate, lastDay, photoUrl } from "@/lib/benches";
import { TOPIC_LABEL } from "@/lib/submissions";
import {
  PHOTO_TYPES,
  removeBenchPhoto,
  replaceBenchPhoto,
  updateBench,
  type BenchCondition,
  type BenchRecord,
} from "@/lib/staff";
import type { StaffData } from "./StaffApp";

const CONDITIONS: { value: BenchCondition; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "unavailable", label: "Not available" },
  { value: "unsurveyed", label: "Not surveyed" },
];

export default function BenchesAdmin({ data, reload }: { data: StaffData; reload: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [onlyNoPhoto, setOnlyNoPhoto] = useState(false);
  const statusById = useMemo(() => new Map(data.benches.map((b) => [b.id, b.status])), [data.benches]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.records.filter(
      (b) =>
        (!onlyNoPhoto || !b.photo_path) &&
        (!q || b.code.toLowerCase().includes(q) || b.area?.toLowerCase().includes(q)),
    );
  }, [data.records, query, onlyNoPhoto]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bench # or area"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm sm:max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={onlyNoPhoto} onChange={(e) => setOnlyNoPhoto(e.target.checked)} className="accent-green-800" />
          Missing photo
        </label>
        <span className="text-sm text-stone-500">{rows.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2 font-medium">Photo</th>
              <th className="px-4 py-2 font-medium">Bench</th>
              <th className="px-4 py-2 font-medium">On map</th>
              <th className="px-4 py-2 font-medium">Condition</th>
              <th className="px-4 py-2 font-medium">Area</th>
              <th className="px-4 py-2 font-medium">Public notes</th>
              <th className="px-4 py-2 font-medium">History</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((b) => (
              <BenchRow
                key={b.id}
                bench={b}
                status={statusById.get(b.id)}
                history={historyFor(data, b.id)}
                reload={reload}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type HistoryItem = { key: string; date: string; kind: string; title: string; detail?: string | null };

// Everything recorded about one bench, newest first.
function historyFor(data: StaffData, benchId: number): HistoryItem[] {
  const items: HistoryItem[] = [
    ...data.adoptions
      .filter((a) => a.bench_id === benchId)
      .map((a) => ({
        key: `a${a.id}`,
        date: a.created_at,
        kind: "Adoption",
        title: `${a.donor_name}: ${formatDate(a.starts_on)} – ${lastDay(a.ends_on)} (${a.status})`,
        detail: [a.honoree && `In honor of ${a.honoree}`, a.staff_notes].filter(Boolean).join(" · ") || null,
      })),
    ...data.submissions
      .filter((s) => s.bench_id === benchId)
      .map((s) => ({
        key: `s${s.id}`,
        date: s.created_at,
        kind: TOPIC_LABEL[s.topic],
        title: `${s.contact_name}${s.photo_paths.length ? ` · ${s.photo_paths.length} photo${s.photo_paths.length > 1 ? "s" : ""}` : ""} (${s.status.replace("_", " ")})`,
        detail: [s.message, s.staff_notes && `Staff: ${s.staff_notes}`].filter(Boolean).join(" · ") || null,
      })),
  ];
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

function BenchRow({
  bench,
  status,
  history,
  reload,
}: {
  bench: BenchRecord;
  status: keyof typeof STATUS_META | undefined;
  history: HistoryItem[];
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  // Save a text field on blur, only if it changed.
  function saveText(field: "area" | "notes", value: string) {
    const next = value.trim() || null;
    if (next === bench[field]) return;
    run(() => updateBench(bench.id, { [field]: next }));
  }

  const input = "w-full rounded-md border border-transparent px-2 py-1 hover:border-stone-300 focus:border-green-700 focus:outline-none disabled:opacity-60";

  return (
    <Fragment>
    <tr className="align-top">
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {bench.photo_path ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Supabase image
            <img src={photoUrl(bench.photo_path)} alt="" className="h-12 w-16 rounded object-cover" />
          ) : (
            <div className="flex h-12 w-16 items-center justify-center rounded bg-stone-100 text-xs text-stone-400">None</div>
          )}
          <div className="flex flex-col items-start text-xs">
            <button disabled={busy} onClick={() => fileInput.current?.click()} className="font-medium text-green-800 hover:underline disabled:opacity-50">
              {bench.photo_path ? "Replace" : "Upload"}
            </button>
            {bench.photo_path && (
              <button
                disabled={busy}
                onClick={() => confirm(`Remove the photo for bench ${bench.code}?`) && run(() => removeBenchPhoto(bench))}
                className="text-stone-500 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={PHOTO_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) run(() => replaceBenchPhoto(bench, file));
            }}
          />
        </div>
        {busy && <p className="mt-1 text-xs text-stone-500">Saving…</p>}
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </td>
      <td className="whitespace-nowrap px-4 py-2 font-medium">
        <a href={benchPath(bench.code)} target="_blank" className="hover:underline">
          {bench.code}
        </a>
      </td>
      <td className="whitespace-nowrap px-4 py-2">
        {status && (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_META[status].color }} />
            {STATUS_META[status].label}
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        <select
          value={bench.condition}
          disabled={busy}
          onChange={(e) => run(() => updateBench(bench.id, { condition: e.target.value as BenchCondition }))}
          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
          aria-label={`Condition of bench ${bench.code}`}
        >
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-40 px-4 py-2">
        <input
          defaultValue={bench.area ?? ""}
          disabled={busy}
          onBlur={(e) => saveText("area", e.target.value)}
          className={input}
          aria-label={`Area of bench ${bench.code}`}
        />
      </td>
      <td className="min-w-56 px-4 py-2">
        <input
          defaultValue={bench.notes ?? ""}
          disabled={busy}
          onBlur={(e) => saveText("notes", e.target.value)}
          className={input}
          aria-label={`Notes for bench ${bench.code}`}
        />
      </td>
      <td className="whitespace-nowrap px-4 py-2">
        {history.length > 0 ? (
          <button onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-green-800 hover:underline" aria-expanded={open}>
            {open ? "Hide" : `View (${history.length})`}
          </button>
        ) : (
          <span className="text-xs text-stone-400">None</span>
        )}
      </td>
    </tr>
    {open && (
      <tr className="bg-stone-50">
        <td colSpan={7} className="px-4 py-3">
          {/* Stays in view when the wide table is scrolled sideways. */}
          <ol className="sticky left-4 max-w-[calc(100vw-4rem)] space-y-2 border-l-2 border-stone-200 pl-4 sm:max-w-3xl">
            {history.map((h) => (
              <li key={h.key} className="text-sm">
                <span className="text-xs text-stone-500">{formatDate(h.date.slice(0, 10))}</span>{" "}
                <span className="font-medium">{h.kind}</span> · {h.title}
                {h.detail && <p className="text-xs text-stone-600">{h.detail}</p>}
              </li>
            ))}
          </ol>
        </td>
      </tr>
    )}
    </Fragment>
  );
}
