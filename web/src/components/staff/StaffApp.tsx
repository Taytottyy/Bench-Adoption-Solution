"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { fetchBenches, type Bench } from "@/lib/benches";
import { fetchAdoptions, fetchBenchRecords, isStaff, type Adoption, type BenchRecord } from "@/lib/staff";
import Overview from "./Overview";
import Requests from "./Requests";
import Adoptions from "./Adoptions";
import BenchesAdmin from "./BenchesAdmin";

export type StaffData = {
  benches: Bench[]; // public view with derived status
  records: BenchRecord[]; // raw bench rows (editable)
  adoptions: Adoption[];
};

const TABS = ["Overview", "Requests", "Adoptions", "Benches"] as const;
type Tab = (typeof TABS)[number];

export default function StaffApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [staff, setStaff] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    isStaff(session.user.id)
      .then(setStaff)
      .catch(() => setStaff(false));
  }, [session]);

  if (session === undefined) return <Centered>Loading…</Centered>;
  if (!session) return <SignIn />;
  if (staff === undefined) return <Centered>Checking access…</Centered>;
  if (!staff) {
    return (
      <Centered>
        <p className="font-medium">{session.user.email} isn&apos;t on the staff list.</p>
        <p className="mt-1 text-sm text-stone-500">Ask an administrator to add your account.</p>
        <button onClick={() => supabase.auth.signOut()} className="mt-4 text-sm font-medium text-green-800 underline">
          Sign out
        </button>
      </Centered>
    );
  }
  return <Dashboard email={session.user.email ?? ""} />;
}

function Dashboard({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<StaffData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [benches, records, adoptions] = await Promise.all([
        fetchBenches(),
        fetchBenchRecords(),
        fetchAdoptions(),
      ]);
      setData({ benches, records, adoptions });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load data");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    reload();
  }, [reload]);

  const pending = data?.adoptions.filter((a) => a.status === "pending").length ?? 0;

  return (
    <div className="min-h-dvh bg-stone-100">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="mr-auto">
            <h1 className="font-semibold text-green-900">Adopt-a-Bench · Staff</h1>
            <p className="text-xs text-stone-500">Van Cortlandt Park</p>
          </div>
          <Link href="/" className="text-sm text-stone-600 hover:text-stone-900">
            Public map
          </Link>
          <span className="hidden text-sm text-stone-500 sm:inline">{email}</span>
          <button onClick={() => supabase.auth.signOut()} className="text-sm font-medium text-green-800 hover:underline">
            Sign out
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                tab === t ? "border-green-800 text-green-900" : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              {t}
              {t === "Requests" && pending > 0 && (
                <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-xs text-white">{pending}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!data ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : tab === "Overview" ? (
          <Overview data={data} />
        ) : tab === "Requests" ? (
          <Requests data={data} reload={reload} />
        ) : tab === "Adoptions" ? (
          <Adoptions data={data} reload={reload} />
        ) : (
          <BenchesAdmin data={data} reload={reload} />
        )}
      </main>
    </div>
  );
}

function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    if (error) setError(error.message);
    setBusy(false);
  }

  const input =
    "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700";
  return (
    <Centered>
      <form onSubmit={handleSubmit} className="w-full space-y-4 text-left">
        <div>
          <h1 className="text-lg font-semibold text-green-900">Staff sign in</h1>
          <p className="text-sm text-stone-500">Adopt-a-Bench · Van Cortlandt Park</p>
        </div>
        <label className="block text-sm font-medium text-stone-700">
          Email
          <input name="email" type="email" required autoComplete="username" className={input} />
        </label>
        <label className="block text-sm font-medium text-stone-700">
          Password
          <input name="password" type="password" required autoComplete="current-password" className={input} />
        </label>
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-green-800 py-2 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow">{children}</div>
    </div>
  );
}
