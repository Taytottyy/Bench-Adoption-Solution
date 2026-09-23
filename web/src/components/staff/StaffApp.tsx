"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { fetchBenches, type Bench } from "@/lib/benches";
import {
  STAFF_EMAIL_DOMAIN,
  fetchAdoptions,
  fetchBenchRecords,
  isStaff,
  type Adoption,
  type BenchRecord,
} from "@/lib/staff";
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
  const [recovering, setRecovering] = useState(false);
  // Keyed by user so a different sign-in never reuses the previous answer.
  const [access, setAccess] = useState<{ userId: string; staff: boolean } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    isStaff()
      .then((staff) => setAccess({ userId, staff }))
      .catch(() => setAccess({ userId, staff: false }));
  }, [userId]);

  if (session === undefined) return <Centered>Loading…</Centered>;
  if (recovering && session) return <SetNewPassword onDone={() => setRecovering(false)} />;
  if (!session) return <SignIn />;
  if (access?.userId !== session.user.id) return <Centered>Checking access…</Centered>;
  if (!access.staff) {
    return (
      <Centered>
        <p className="font-medium">{session.user.email} doesn&apos;t have staff access.</p>
        <p className="mt-1 text-sm text-stone-500">
          Sign in with your @{STAFF_EMAIL_DOMAIN} email, or ask an administrator to add your account.
        </p>
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

type Mode = "signIn" | "signUp" | "reset";

function SignIn() {
  const [mode, setMode] = useState<Mode>("signIn");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim();
    const password = String(f.get("password") ?? "");
    // Where confirmation / reset links send people back to.
    const redirectTo = `${window.location.origin}/staff`;
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "signIn") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else if (mode === "signUp") {
      if (!email.toLowerCase().endsWith(`@${STAFF_EMAIL_DOMAIN}`)) {
        setError(`Use your @${STAFF_EMAIL_DOMAIN} email address.`);
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) setError(error.message);
        else setNotice(`Check ${email} for a confirmation link, then sign in.`);
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) setError(error.message);
      else setNotice(`If ${email} has an account, a password reset link is on its way.`);
    }
    setBusy(false);
  }

  const heading = { signIn: "Staff sign in", signUp: "Create a staff account", reset: "Reset your password" }[mode];
  const action = { signIn: "Sign in", signUp: "Create account", reset: "Send reset link" }[mode];

  return (
    <Centered>
      <form onSubmit={handleSubmit} className="w-full space-y-4 text-left">
        <div>
          <h1 className="text-lg font-semibold text-green-900">{heading}</h1>
          <p className="text-sm text-stone-500">Adopt-a-Bench · Van Cortlandt Park</p>
        </div>
        <label className="block text-sm font-medium text-stone-700">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder={mode === "signUp" ? `you@${STAFF_EMAIL_DOMAIN}` : undefined}
            className={INPUT}
          />
        </label>
        {mode !== "reset" && (
          <label className="block text-sm font-medium text-stone-700">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={mode === "signUp" ? 8 : undefined}
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              className={INPUT}
            />
          </label>
        )}
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p className="rounded-md bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-green-800 py-2 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60">
          {busy ? "Please wait…" : action}
        </button>

        <div className="flex justify-between text-sm">
          {mode === "signIn" ? (
            <>
              <button type="button" onClick={() => switchTo("signUp")} className="font-medium text-green-800 hover:underline">
                Create account
              </button>
              <button type="button" onClick={() => switchTo("reset")} className="text-stone-500 hover:underline">
                Forgot password?
              </button>
            </>
          ) : (
            <button type="button" onClick={() => switchTo("signIn")} className="font-medium text-green-800 hover:underline">
              Back to sign in
            </button>
          )}
        </div>
        {mode === "signUp" && (
          <p className="text-xs text-stone-500">
            Staff access is for @{STAFF_EMAIL_DOMAIN} addresses. You&apos;ll need to confirm your email first.
          </p>
        )}
      </form>
    </Centered>
  );
}

function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <Centered>
      <form onSubmit={handleSubmit} className="w-full space-y-4 text-left">
        <h1 className="text-lg font-semibold text-green-900">Choose a new password</h1>
        <label className="block text-sm font-medium text-stone-700">
          New password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT} />
        </label>
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-green-800 py-2 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60">
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </Centered>
  );
}

const INPUT =
  "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-700 focus:outline-none focus:ring-1 focus:ring-green-700";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow">{children}</div>
    </div>
  );
}
