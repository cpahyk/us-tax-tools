export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold text-ink">Sign-in link problem</h1>
      <p className="max-w-sm text-ink-muted">
        {message ?? "That link is invalid or has expired."}
      </p>
      <a href="/login" className="text-ledger underline underline-offset-2">
        Request a new link
      </a>
    </main>
  );
}
