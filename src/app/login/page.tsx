"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { status: "idle" };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mb-6 text-sm text-ink-muted">
          We&apos;ll email you a link — no password needed.
        </p>

        {state.status === "sent" ? (
          <p className="rounded-md border border-hairline bg-white px-4 py-3 text-sm text-ink">
            {state.message}
          </p>
        ) : (
          <form action={formAction} className="flex flex-col gap-3">
            <input
              type="email"
              name="email"
              required
              placeholder="you@firm.com"
              className="rounded-md border border-hairline px-3 py-2 text-ink outline-none focus:border-ledger"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-ledger px-3 py-2 font-medium text-white transition hover:bg-ledger-dark disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send sign-in link"}
            </button>
            {state.status === "error" && (
              <p className="text-sm text-red-600">{state.message}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
