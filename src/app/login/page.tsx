"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setPending(true);
    setError("");
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    setPending(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(`Check ${email.trim()} for a sign-in link.`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold text-ink">
          Sign in
        </h1>

        <p className="mb-6 text-sm text-ink-muted">
          We&apos;ll email you a link — no password needed.
        </p>

        {message ? (
          <p className="rounded-md border border-hairline bg-white px-4 py-3 text-sm text-ink">
            {message}
          </p>
        ) : (
          <form
            onSubmit={handleLogin}
            className="flex flex-col gap-3"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@firm.com"
              className="rounded-md border border-hairline px-3 py-2 text-ink outline-none focus:border-ledger"
            />

            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-ledger px-3 py-2 font-medium text-white transition hover:bg-ledger-dark disabled:opacity-60"
            >
              {pending
                ? "Sending…"
                : "Send sign-in link"}
            </button>

            {error && (
              <p className="text-sm text-red-600">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}