"use client";

import { useState } from "react";
import { benchPath, formatDate, lastDay } from "@/lib/benches";
import { reviewAdoption, type Adoption } from "@/lib/staff";
import type { StaffData } from "./StaffApp";

export default function Requests({ data, reload }: { data: StaffData; reload: () => Promise<void> }) {
  const pending = data.adoptions
    .filter((a) => a.status === "pending")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (pending.length === 0) {
    return <p className="rounded-xl bg-white p-6 text-sm text-stone-500 shadow-sm">No pending requests.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">Oldest first. Pending requests already hold the bench for the requested dates.</p>
      {pending.map((a) => (
        <RequestCard key={a.id} adoption={a} reload={reload} />
      ))}
    </div>
  );
}

function RequestCard({ adoption: a, reload }: { adoption: Adoption; reload: () => Promise<void> }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    if (!approve && !confirm(`Reject ${a.donor_name}'s request for bench ${a.benches?.code}? The bench will be released.`)) return;
    setBusy(approve ? "approve" : "reject");
    setError(null);
    try {
      await reviewAdoption(a.id, approve, notes);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <article className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          <a href={benchPath(a.benches?.code ?? "")} target="_blank" className="hover:underline">
            Bench {a.benches?.code}
          </a>
          <span className="ml-2 text-sm font-normal text-stone-500">{a.benches?.area}</span>
        </h3>
        <p className="text-xs text-stone-500">Submitted {formatDate(a.created_at.slice(0, 10))}</p>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Field term="Donor">
          {a.donor_name}
          {!a.show_donor && <span className="ml-1.5 text-xs text-stone-500">(shown as Anonymous)</span>}
        </Field>
        <Field term="Term">
          {formatDate(a.starts_on)} – {lastDay(a.ends_on)}
        </Field>
        <Field term="Email">
          <a href={`mailto:${a.contact_email}`} className="text-green-800 hover:underline">
            {a.contact_email}
          </a>
        </Field>
        <Field term="Phone">{a.contact_phone ?? "—"}</Field>
        <Field term="In honor of">{a.honoree ?? "—"}</Field>
        <Field term="Plaque">{a.plaque_text ? `“${a.plaque_text}”` : "—"}</Field>
      </dl>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium text-stone-700">
          Staff note (optional)
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Plaque ordered, donation received"
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm font-normal"
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => decide(false)}
            disabled={busy !== null}
            className="rounded-lg border border-stone-300 px-4 py-1.5 text-sm font-medium hover:bg-stone-50 disabled:opacity-60"
          >
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </button>
          <button
            onClick={() => decide(true)}
            disabled={busy !== null}
            className="rounded-lg bg-green-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60"
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </article>
  );
}

function Field({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-2">
      <dt className="text-stone-500">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
