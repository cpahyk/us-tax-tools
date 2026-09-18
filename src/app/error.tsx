"use client";

// Error boundaries must be Client Components (Next.js convention).
// NOTE: this surfaces error.message directly, which is fine for a
// pre-launch scaffold but worth revisiting before production — a raw
// exception message (e.g. from a database driver) can leak more detail
// than end users, especially clients, should see.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="max-w-md text-sm text-ink-muted">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-md bg-ledger px-3 py-2 text-sm font-medium text-white hover:bg-ledger-dark"
      >
        Try again
      </button>
    </main>
  );
}
