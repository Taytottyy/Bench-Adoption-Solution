"use client";

import { useMemo, useState } from "react";
import { formatDate, lastDay, todayISO } from "@/lib/benches";
import { updateAdoption, type Adoption } from "@/lib/staff";
import type { StaffData } from "./StaffApp";

type Phase = "active" | "upcoming" | "ended" | "pending" | "rejected" | "cancelled";

const PHASE_STYLE: Record<Phase, string> = {
  active: "bg-red-50 text-red-800",
  upcoming: "bg-sky-50 text-sky-800",
  ended: "bg-stone-100 text-stone-600",
  pending: "bg-orange-50 text-orange-800",
  rejected: "bg-stone-100 text-stone-500",
  cancelled: "bg-stone-100 text-stone-500",
};

function phaseOf(a: Adoption, today: string): Phase {
  if (a.status !== "approved") return a.status;
  if (a.ends_on <= today) return "ended";
  if (a.starts_on > today) return "upcoming";
  return "active";
}

export default function Adoptions({ data, reload }: { data: StaffData; reload: () => Promise<void> }) {
  const today = todayISO();
  const [phase, setPhase] = useState<Phase | "all">("active");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.adoptions
      .map((a) => ({ ...a, phase: phaseOf(a, today) }))
      .filter((a) => phase === "all" || a.phase === phase)
      .filter(
        (a) =>
          !q ||
          [a.benches?.code, a.donor_name, a.honoree, a.contact_email].some((v) => v?.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  }, [data.adoptions, phase, query, today]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={phase}
          onChange={(e) => setPhase(e.target.value as Phase | "all")}
          className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
          aria-label="Filter by status"
        >
          <option value="active">Active</option>
          <option value="upcoming">Upcoming</option>
          <option value="pending">Pending</option>
          <option value="ended">Ended</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bench, donor, honoree, email"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm sm:max-w-sm"
        />
        <span className="self-center text-sm text-stone-500">{rows.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2 font-medium">Bench</th>
              <th className="px-4 py-2 font-medium">Donor</th>
              <th className="px-4 py-2 font-medium">Term</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">Notes</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((a) => (
              <Row key={a.id} adoption={a} phase={a.phase} today={today} reload={reload} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-stone-500">
                  No adoptions match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  adoption: a,
  phase,
  today,
  reload,
}: {
  adoption: Adoption;
  phase: Phase;
  today: string;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(message: string, patch: Parameters<typeof updateAdoption>[1]) {
    if (!confirm(message)) return;
    setBusy(true);
    setError(null);
    try {
      await updateAdoption(a.id, patch);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const bench = a.benches?.code;
  // Ending early keeps the record (and its history) but frees the bench from today.
  const canEndToday = phase === "active" && a.starts_on < today;
  const canCancel = phase === "pending" || phase === "upcoming" || phase === "active";

  return (
    <tr className="align-top">
      <td className="whitespace-nowrap px-4 py-2 font-medium">
        {bench}
        <div className="text-xs font-normal text-stone-500">{a.benches?.area}</div>
      </td>
      <td className="px-4 py-2">
        {a.donor_name}
        {a.honoree && <div className="text-xs text-stone-500">In honor of {a.honoree}</div>}
      </td>
      <td className="whitespace-nowrap px-4 py-2">
        {formatDate(a.starts_on)} –<br />
        {lastDay(a.ends_on)}
      </td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PHASE_STYLE[phase]}`}>{phase}</span>
      </td>
      <td className="px-4 py-2">
        <a href={`mailto:${a.contact_email}`} className="text-green-800 hover:underline">
          {a.contact_email}
        </a>
        {a.contact_phone && <div className="text-xs text-stone-500">{a.contact_phone}</div>}
      </td>
      <td className="max-w-48 px-4 py-2 text-xs text-stone-600">{a.staff_notes}</td>
      <td className="whitespace-nowrap px-4 py-2 text-right">
        {canEndToday && (
          <button
            disabled={busy}
            onClick={() => run(`End ${a.donor_name}'s adoption of bench ${bench} today? The bench becomes available.`, { ends_on: today })}
            className="mr-3 text-xs font-medium text-stone-700 hover:underline disabled:opacity-50"
          >
            End today
          </button>
        )}
        {canCancel && (
          <button
            disabled={busy}
            onClick={() => run(`Cancel ${a.donor_name}'s adoption of bench ${bench}? This removes it from the map.`, { status: "cancelled" })}
            className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        {error && <p className="mt-1 whitespace-normal text-xs text-red-700">{error}</p>}
      </td>
    </tr>
  );
}
