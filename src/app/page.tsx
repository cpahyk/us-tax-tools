export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-mono text-sm text-ink-muted">Scaffold running</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        US Tax Tools
      </h1>
      <p className="max-w-md text-ink-muted">
        Database, auth, and tenant isolation are wired up. The organizer and
        client portal screens come next.
      </p>
    </main>
  );
}
