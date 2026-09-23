"use client";

import { useState } from "react";
import { formatDate, lastDay, requestAdoption, todayISO, type Bench } from "@/lib/benches";

const TERMS = [
  { months: 12, label: "1 year" },
  { months: 24, label: "2 years" },
  { months: 36, label: "3 years" },
  { months: 60, label: "5 years" },
  { months: 120, label: "10 years" },
];

type Done = { startsOn: string; endsOn: string };

export default function AdoptForm({
  bench,
  onCancel,
  onSubmitted,
}: {
  bench: Bench;
  onCancel: () => void;
  onSubmitted: () => void;
}) {
  const earliest = bench.available_on && bench.available_on > todayISO() ? bench.available_on : todayISO();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const row = await requestAdoption({
        benchId: bench.id,
        donorName: String(f.get("donorName") ?? ""),
        email: String(f.get("email") ?? ""),
        phone: String(f.get("phone") ?? ""),
        termMonths: Number(f.get("term")),
        startsOn: String(f.get("startsOn") ?? ""),
        honoree: String(f.get("honoree") ?? ""),
        plaqueText: String(f.get("plaqueText") ?? ""),
        showDonor: f.get("showDonor") === "on",
      });
      setDone({ startsOn: row.starts_on, endsOn: row.ends_on });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-green-50 p-4 text-green-900">
          <p className="font-semibold">Request received — thank you!</p>
          <p className="mt-1 text-sm">
            Bench {bench.code} is held for you from {formatDate(done.startsOn)} through{" "}
            {lastDay(done.endsOn)} while park staff review your request. We&apos;ll contact you by
            email.
          </p>
        </div>
        <button onClick={onCancel} className="w-full rounded-lg border border-stone-300 py-2 text-sm font-medium hover:bg-stone-50">
          Back to bench
        </button>
      </div>
    );
  }

  const input =
    "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700";
  const label = "block text-sm font-medium text-stone-700";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-base font-semibold">Adopt bench {bench.code}</h3>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Term
          <select name="term" defaultValue={12} className={input}>
            {TERMS.map((t) => (
              <option key={t.months} value={t.months}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Start date
          <input type="date" name="startsOn" min={earliest} defaultValue={earliest} required className={input} />
        </label>
      </div>

      <label className={label}>
        Your name <span className="text-red-700">*</span>
        <input name="donorName" required maxLength={120} autoComplete="name" className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" name="showDonor" defaultChecked className="h-4 w-4 accent-green-700" />
        Show my name on the public map
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Email <span className="text-red-700">*</span>
          <input type="email" name="email" required autoComplete="email" className={input} />
        </label>
        <label className={label}>
          Phone
          <input type="tel" name="phone" autoComplete="tel" className={input} />
        </label>
      </div>

      <label className={label}>
        In honor / memory of
        <input name="honoree" maxLength={120} className={input} />
      </label>
      <label className={label}>
        Plaque text
        <textarea name="plaqueText" maxLength={200} rows={2} className={input} />
        <span className="text-xs font-normal text-stone-500">Up to 200 characters.</span>
      </label>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-stone-300 py-2 text-sm font-medium hover:bg-stone-50">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="flex-1 rounded-lg bg-green-800 py-2 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60">
          {submitting ? "Submitting…" : "Submit request"}
        </button>
      </div>
      <p className="text-xs text-stone-500">
        Your email and phone are only shared with park staff. No payment is taken here.
      </p>
    </form>
  );
}
