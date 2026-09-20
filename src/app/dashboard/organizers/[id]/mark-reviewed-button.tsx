"use client";

import { useState, useTransition } from "react";
import { markReviewed } from "./actions";

export function MarkReviewedButton({ organizerId }: { organizerId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-sm text-ledger">Marked reviewed.</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await markReviewed(organizerId);
            if (result.error) {
              setError(result.error);
            } else {
              setDone(true);
            }
          });
        }}
        disabled={pending}
        className="rounded-md bg-ledger px-3 py-2 text-sm font-medium text-white hover:bg-ledger-dark disabled:opacity-60"
      >
        {pending ? "Saving…" : "Mark reviewed"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
