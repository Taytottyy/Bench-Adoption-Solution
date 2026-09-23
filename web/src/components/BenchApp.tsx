"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BenchList from "./BenchList";
import BenchPanel from "./BenchPanel";
import { SATELLITE_AVAILABLE, type BaseStyle } from "./BenchMap";
import {
  STATUS_META,
  STATUS_ORDER,
  benchPath,
  fetchBenches,
  type Bench,
  type BenchStatus,
} from "@/lib/benches";

// MapLibre needs the browser (WebGL), so skip server rendering.
const BenchMap = dynamic(() => import("./BenchMap"), { ssr: false });

type View = "map" | "list";
const ONLY_AVAILABLE = new Set<BenchStatus>(STATUS_ORDER.filter((s) => s !== "available"));

export default function BenchApp({ initialBenchId = null }: { initialBenchId?: number | null }) {
  const [benches, setBenches] = useState<Bench[] | null>(null); // null until first load
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(initialBenchId);
  const [hidden, setHidden] = useState<Set<BenchStatus>>(new Set());
  const [area, setArea] = useState("");
  const [query, setQuery] = useState("");
  const [base, setBase] = useState<BaseStyle>("map");
  const [view, setView] = useState<View>("map");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [pulse, setPulse] = useState<{ id: number; n: number } | null>(null);
  const framedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      setBenches(await fetchBenches());
      setLoadError(null);
      // First load: frame all benches beside the controls (unless a bench link is open).
      if (!framedOnce.current && initialBenchId === null) {
        framedOnce.current = true;
        setFitKey((k) => k + 1);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load benches");
    }
  }, [initialBenchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const all = useMemo(() => benches ?? [], [benches]);
  const loading = benches === null && !loadError;

  const areas = useMemo(
    () => [...new Set(all.map((b) => b.area).filter((a): a is string => Boolean(a)))].sort(),
    [all],
  );

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<BenchStatus, number>;
    for (const b of all) if (!area || b.area === area) c[b.status]++;
    return c;
  }, [all, area]);

  const availableTotal = useMemo(() => all.filter((b) => b.status === "available").length, [all]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (b) =>
        !hidden.has(b.status) &&
        (!area || b.area === area) &&
        (!q ||
          b.code.toLowerCase().includes(q) ||
          b.donor_name?.toLowerCase().includes(q) ||
          b.honoree?.toLowerCase().includes(q)),
    );
  }, [all, hidden, area, query]);

  const selected = all.find((b) => b.id === selectedId) ?? null;
  const onlyAvailable = STATUS_ORDER.every((s) => (s === "available" ? !hidden.has(s) : hidden.has(s)));

  // Keep the address bar on a shareable /bench/<code> link for the open bench.
  const select = useCallback(
    (id: number | null) => {
      setSelectedId(id);
      const bench = all.find((b) => b.id === id);
      const path = bench ? benchPath(bench.code) : "/";
      if (window.location.pathname !== path) window.history.replaceState(null, "", path);
      document.title = bench
        ? `Bench ${bench.code} · Van Cortlandt Park`
        : "Adopt-a-Bench · Van Cortlandt Park";
    },
    [all],
  );

  function toggleStatus(s: BenchStatus) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  // "Find a bench": show only available benches and zoom the map to them.
  function findBench() {
    setHidden(ONLY_AVAILABLE);
    setArea("");
    setQuery("");
    select(null);
    setFitKey((k) => k + 1);
  }

  function viewOnMap(id: number) {
    setView("map");
    select(id);
  }

  async function handleAdoptionSubmitted(benchId: number) {
    await load();
    setPulse((p) => ({ id: benchId, n: (p?.n ?? 0) + 1 }));
  }

  const controls = (
    <div className="rounded-2xl bg-white/95 shadow-lg backdrop-blur">
      <div className="flex items-start gap-3 px-4 pt-3">
        <div className="flex-1">
          <h1 className="text-sm font-semibold leading-tight text-green-900">Adopt-a-Bench</h1>
          <p className="text-xs text-stone-500">Van Cortlandt Park</p>
        </div>
        <div className="flex overflow-hidden rounded-md border border-stone-300 text-xs font-medium" role="group" aria-label="View">
          {(["map", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-2.5 py-1 capitalize ${view === v ? "bg-green-800 text-white" : "bg-white text-stone-700"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Headline + call to action */}
      <div className="px-4 pt-3">
        {loading ? (
          <div className="space-y-2" aria-hidden>
            <div className="h-6 w-4/5 animate-pulse rounded bg-stone-200" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-stone-100" />
            <div className="h-9 w-full animate-pulse rounded-lg bg-stone-100" />
          </div>
        ) : availableTotal > 0 ? (
          <>
            <p className="text-lg font-semibold leading-snug text-stone-900">
              <span className="text-green-800">{availableTotal} benches</span> waiting to be adopted
            </p>
            <p className="mt-0.5 text-sm text-stone-500">Honor someone special with a bench in the park.</p>
            {onlyAvailable ? (
              <p className="mt-3 flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
                Showing available benches
                <button onClick={() => setHidden(new Set())} className="font-medium underline">
                  Show all
                </button>
              </p>
            ) : (
              <button
                onClick={findBench}
                className="mt-3 w-full rounded-lg bg-green-800 py-2 text-sm font-semibold text-white hover:bg-green-900"
              >
                Find a bench
              </button>
            )}
          </>
        ) : (
          <p className="text-lg font-semibold text-stone-900">Every bench is adopted — thank you!</p>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 pb-3 pt-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bench #, donor, or honoree"
          aria-label="Search benches"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
        />
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs font-medium sm:hidden"
          aria-expanded={filtersOpen}
        >
          {filtersOpen ? "Hide" : "Filters"}
        </button>
      </div>

      <div className={`${filtersOpen ? "block" : "hidden"} border-t border-stone-200 px-4 py-3 sm:block`}>
        <ul className="space-y-1">
          {STATUS_ORDER.map((s) => (
            <li key={s}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!hidden.has(s)}
                  onChange={() => toggleStatus(s)}
                  className="h-3.5 w-3.5 accent-green-800"
                />
                <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ backgroundColor: STATUS_META[s].color }} />
                <span className="flex-1">{STATUS_META[s].label}</span>
                {loading ? (
                  <span className="h-3 w-5 animate-pulse rounded bg-stone-200" aria-hidden />
                ) : (
                  <span className="tabular-nums text-stone-500">{counts[s]}</span>
                )}
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex gap-2">
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
            aria-label="Park area"
          >
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          {SATELLITE_AVAILABLE && view === "map" && (
            <div className="flex overflow-hidden rounded-md border border-stone-300 text-xs font-medium">
              {(["map", "satellite"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBase(b)}
                  aria-pressed={base === b}
                  className={`px-2.5 capitalize ${base === b ? "bg-green-800 text-white" : "bg-white text-stone-700"}`}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const errorNote = loadError && (
    <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 shadow">Couldn&apos;t load benches: {loadError}</p>
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-stone-200">
      <BenchMap benches={visible} selectedId={selectedId} onSelect={select} base={base} fitKey={fitKey} pulse={pulse} />

      {loading && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center">
          <p className="flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-stone-700 shadow-lg">
            <span className="h-2 w-2 animate-ping rounded-full bg-green-700" aria-hidden />
            Loading benches…
          </p>
        </div>
      )}

      {view === "map" ? (
        <section data-overlay="controls" className="absolute left-3 right-3 top-3 z-10 sm:right-auto sm:w-80">
          {controls}
          {errorNote}
        </section>
      ) : (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-stone-100">
          <div className="mx-auto grid max-w-6xl gap-4 p-3 sm:p-4 lg:grid-cols-[20rem_1fr] lg:items-start">
            <section className="min-w-0 lg:sticky lg:top-4">
              {controls}
              {errorNote}
            </section>
            <section aria-label="Bench list" className="min-w-0">
              <p className="mb-2 text-sm text-stone-600">
                {loading ? "Loading benches…" : `${visible.length} of ${all.length} benches`}
              </p>
              {!loading && <BenchList benches={visible} onView={viewOnMap} />}
            </section>
          </div>
        </div>
      )}

      {/* Selected bench: bottom sheet on phones, side panel on larger screens */}
      {selected && view === "map" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex max-h-[70dvh] sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100dvh-1.5rem)] sm:w-96">
          <div data-overlay="panel" className="w-full">
            <BenchPanel
              key={selected.id}
              bench={selected}
              onClose={() => select(null)}
              onSubmitted={() => handleAdoptionSubmitted(selected.id)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
