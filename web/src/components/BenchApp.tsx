"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import BenchPanel from "./BenchPanel";
import { SATELLITE_AVAILABLE, type BaseStyle } from "./BenchMap";
import { STATUS_META, STATUS_ORDER, fetchBenches, type Bench, type BenchStatus } from "@/lib/benches";

// MapLibre needs the browser (WebGL), so skip server rendering.
const BenchMap = dynamic(() => import("./BenchMap"), { ssr: false });

export default function BenchApp() {
  const [benches, setBenches] = useState<Bench[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<BenchStatus>>(new Set());
  const [area, setArea] = useState("");
  const [query, setQuery] = useState("");
  const [base, setBase] = useState<BaseStyle>("map");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setBenches(await fetchBenches());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load benches");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const areas = useMemo(
    () => [...new Set(benches.map((b) => b.area).filter((a): a is string => Boolean(a)))].sort(),
    [benches],
  );

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<BenchStatus, number>;
    for (const b of benches) if (!area || b.area === area) c[b.status]++;
    return c;
  }, [benches, area]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return benches.filter(
      (b) =>
        !hidden.has(b.status) &&
        (!area || b.area === area) &&
        (!q ||
          b.code.toLowerCase().includes(q) ||
          b.donor_name?.toLowerCase().includes(q) ||
          b.honoree?.toLowerCase().includes(q)),
    );
  }, [benches, hidden, area, query]);

  const selected = benches.find((b) => b.id === selectedId) ?? null;

  function toggleStatus(s: BenchStatus) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-stone-200">
      <BenchMap benches={visible} selectedId={selectedId} onSelect={setSelectedId} base={base} />

      {/* Controls */}
      <section className="absolute left-3 right-3 top-3 z-10 sm:right-auto sm:w-80">
        <div className="rounded-2xl bg-white/95 shadow-lg backdrop-blur">
          <div className="flex items-center gap-3 px-4 pt-3">
            <div className="flex-1">
              <h1 className="text-base font-semibold leading-tight text-green-900">Adopt-a-Bench</h1>
              <p className="text-xs text-stone-500">Van Cortlandt Park</p>
            </div>
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className="rounded-md border border-stone-300 px-2.5 py-1 text-xs font-medium sm:hidden"
              aria-expanded={filtersOpen}
            >
              {filtersOpen ? "Hide" : "Filters"}
            </button>
          </div>

          <div className="px-4 pb-3 pt-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bench #, donor, or honoree"
              className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700"
            />
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
                    <span
                      className="h-3 w-3 rounded-full ring-2 ring-white"
                      style={{ backgroundColor: STATUS_META[s].color }}
                    />
                    <span className="flex-1">{STATUS_META[s].label}</span>
                    <span className="tabular-nums text-stone-500">{counts[s]}</span>
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
              {SATELLITE_AVAILABLE && (
                <div className="flex overflow-hidden rounded-md border border-stone-300 text-xs font-medium">
                  {(["map", "satellite"] as const).map((b) => (
                    <button
                      key={b}
                      onClick={() => setBase(b)}
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

        {loadError && (
          <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800 shadow">
            Couldn&apos;t load benches: {loadError}
          </p>
        )}
      </section>

      {/* Selected bench: bottom sheet on phones, side panel on larger screens */}
      {selected && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex max-h-[70dvh] sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100dvh-1.5rem)] sm:w-96">
          <div className="w-full">
            <BenchPanel
              key={selected.id}
              bench={selected}
              onClose={() => setSelectedId(null)}
              onSubmitted={load}
            />
          </div>
        </div>
      )}
    </main>
  );
}
