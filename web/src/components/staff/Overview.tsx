"use client";

import { useMemo } from "react";
import { STATUS_META, formatDate, lastDay, todayISO, type BenchStatus } from "@/lib/benches";
import type { StaffData } from "./StaffApp";

const RENEWAL_WINDOW_DAYS = 90;

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

type AreaRow = { area: string; total: number } & Record<BenchStatus, number>;

export default function Overview({ data }: { data: StaffData }) {
  const today = todayISO();

  const totals = useMemo(() => {
    const t = { available: 0, adopted: 0, pending: 0, unavailable: 0, unsurveyed: 0 } as Record<BenchStatus, number>;
    for (const b of data.benches) t[b.status]++;
    return t;
  }, [data.benches]);
  const adoptable = totals.available + totals.adopted + totals.pending;
  const adoptedPct = adoptable ? Math.round((totals.adopted / adoptable) * 100) : 0;
  const availablePct = adoptable ? Math.round((totals.available / adoptable) * 100) : 0;

  const areas = useMemo(() => {
    const rows = new Map<string, AreaRow>();
    for (const b of data.benches) {
      const key = b.area ?? "Unassigned";
      const row =
        rows.get(key) ??
        { area: key, total: 0, available: 0, adopted: 0, pending: 0, unavailable: 0, unsurveyed: 0 };
      row.total++;
      row[b.status]++;
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => a.area.localeCompare(b.area));
  }, [data.benches]);

  const renewals = useMemo(() => {
    const horizon = addDays(today, RENEWAL_WINDOW_DAYS);
    const live = data.adoptions.filter((a) => a.status === "approved" || a.status === "pending");
    return data.adoptions
      .filter((a) => a.status === "approved" && a.ends_on > today && a.ends_on <= horizon)
      .map((a) => ({
        ...a,
        renewed: live.some((o) => o.bench_id === a.bench_id && o.id !== a.id && o.starts_on >= a.ends_on),
      }))
      .sort((a, b) => a.ends_on.localeCompare(b.ends_on));
  }, [data.adoptions, today]);

  const pendingCount = data.adoptions.filter((a) => a.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Benches" value={data.benches.length} />
        <Stat label="Adopted" value={totals.adopted} sub={`${adoptedPct}% of adoptable`} color={STATUS_META.adopted.color} />
        <Stat label="Available" value={totals.available} sub={`${availablePct}% of adoptable`} color={STATUS_META.available.color} />
        <Stat label="Pending requests" value={pendingCount} color={STATUS_META.pending.color} />
        <Stat label="Ending in 90 days" value={renewals.length} sub={`${renewals.filter((r) => !r.renewed).length} not renewed`} />
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">By area</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Area</th>
                <th className="py-2 pr-4 text-right font-medium">Benches</th>
                <th className="py-2 pr-4 text-right font-medium">Adopted</th>
                <th className="py-2 pr-4 text-right font-medium">Pending</th>
                <th className="py-2 pr-4 text-right font-medium">Available</th>
                <th className="py-2 pr-4 text-right font-medium">Not adoptable</th>
                <th className="w-48 py-2 font-medium">Adoption rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {areas.map((r) => {
                const adoptableHere = r.available + r.adopted + r.pending;
                const pct = adoptableHere ? Math.round((r.adopted / adoptableHere) * 100) : 0;
                return (
                  <tr key={r.area}>
                    <td className="py-2 pr-4 font-medium">{r.area}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.total}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.adopted}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.pending}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.available}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-stone-500">{r.unavailable + r.unsurveyed}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: STATUS_META.adopted.color }} />
                        </div>
                        <span className="w-9 text-right text-xs tabular-nums text-stone-600">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Upcoming renewals</h2>
        <p className="mb-3 text-sm text-stone-500">Adoptions ending in the next {RENEWAL_WINDOW_DAYS} days.</p>
        {renewals.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing ending soon.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Bench</th>
                  <th className="py-2 pr-4 font-medium">Donor</th>
                  <th className="py-2 pr-4 font-medium">Contact</th>
                  <th className="py-2 pr-4 font-medium">Last day</th>
                  <th className="py-2 font-medium">Renewal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {renewals.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-4 font-medium">{a.benches?.code}</td>
                    <td className="py-2 pr-4">{a.donor_name}</td>
                    <td className="py-2 pr-4">
                      <a href={`mailto:${a.contact_email}`} className="text-green-800 hover:underline">
                        {a.contact_email}
                      </a>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {lastDay(a.ends_on)}{" "}
                      <span className="text-stone-500">({daysBetween(today, a.ends_on)} days)</span>
                    </td>
                    <td className="py-2">
                      {a.renewed ? (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">Next term booked</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Not renewed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-stone-400">As of {formatDate(today)}.</p>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">
        {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
    </div>
  );
}
