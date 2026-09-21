"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function submit() {
    setError("");
    setMessage("");

    if (!supabase) {
      setError("Supabase is not configured in this copy of the app. Add the two NEXT_PUBLIC_SUPABASE_* values to .env.local first.");
      return;
    }

    if (!email.trim() || password.length < 6) {
      setError("Enter an email address and a password of at least 6 characters.");
      return;
    }

    setBusy(true);

    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        router.replace("/");
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          router.replace("/");
        } else {
          setMessage("Account created. Check your email for the confirmation link, then come back and sign in.");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400">Campaign Ledger</p>
          <h1 className="mt-2 text-3xl font-bold text-stone-100">D&D Character Manager</h1>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Your characters now live in Supabase, so the same account can access them from different devices.
          </p>
        </div>

        <section className="rounded-2xl border border-stone-800 bg-stone-900/70 p-6 shadow-[0_16px_50px_rgba(0,0,0,0.25)]">
          {!isSupabaseConfigured() ? (
            <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm leading-6 text-amber-300">
              Supabase is not configured yet. Copy <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> into your project's <code>.env.local</code> file.
            </div>
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 rounded-xl border border-stone-800 bg-stone-950 p-1">
                <button
                  onClick={() => { setMode("signin"); setError(""); setMessage(""); }}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "signin" ? "bg-stone-100 text-stone-950" : "text-stone-400 hover:bg-stone-800"}`}
                >
                  Sign in
                </button>
                <button
                  onClick={() => { setMode("signup"); setError(""); setMessage(""); }}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "signup" ? "bg-stone-100 text-stone-950" : "text-stone-400 hover:bg-stone-800"}`}
                >
                  Create account
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-3 text-sm text-stone-100 outline-none focus:border-amber-400"
                    placeholder="you@example.com"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">Password</span>
                  <input
                    type="password"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
                    className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-3 text-sm text-stone-100 outline-none focus:border-amber-400"
                    placeholder="At least 6 characters"
                  />
                </label>

                {error && <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-3 text-sm leading-5 text-red-300">{error}</div>}
                {message && <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3 text-sm leading-5 text-emerald-300">{message}</div>}

                <button
                  onClick={() => void submit()}
                  disabled={busy}
                  className="w-full rounded-xl bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
