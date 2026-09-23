"use client";

import { STATUS_META, formatDate, lastDay, todayISO, type Bench } from "@/lib/benches";

// Table alternative to the map: works with screen readers and makes it easy
// to scan for a donor or honoree. Uses the same search/filters as the map.
export default function BenchList({ benches, onView }: { benches: Bench[]; onView: (id: number) => void }) {
  const rows = [...benches].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const today = todayISO();

  if (rows.length === 0) {
    return <p className="rounded-2xl bg-white p-6 text-sm text-stone-500 shadow">No benches match your search and filters.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Benches in Van Cortlandt Park and their adoption status</caption>
          <thead className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Bench</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Adopted by</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">In honor of</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Dates</th>
              <th scope="col" className="px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((b) => {
              const meta = STATUS_META[b.status];
              const dates =
                b.status === "adopted"
                  ? `${b.adopted_from && b.adopted_from > today ? `From ${formatDate(b.adopted_from)} ` : ""}until ${lastDay(b.adopted_until)}`
                  : b.status === "available"
                    ? "Available now"
                    : b.available_on && b.status === "pending"
                      ? `Next available ${formatDate(b.available_on)}`
                      : "—";
              return (
                <tr key={b.id} className="hover:bg-stone-50">
                  <th scope="row" className="px-4 py-2.5 text-left">
                    <span className="block whitespace-nowrap font-semibold">{b.code}</span>
                    {b.area && <span className="block text-xs font-normal text-stone-500">{b.area}</span>}
                  </th>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {b.donor_name ?? ""}
                    {b.honoree && <span className="block text-xs text-stone-500 md:hidden">In honor of {b.honoree}</span>}
                  </td>
                  <td className="hidden px-4 py-2.5 text-stone-600 md:table-cell">{b.honoree ?? ""}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-stone-600">{dates}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      onClick={() => onView(b.id)}
                      className="font-medium text-green-800 hover:underline"
                      aria-label={`View bench ${b.code} on the map`}
                    >
                      {b.status === "available" ? "Adopt" : "View"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
