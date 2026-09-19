"use client";

import { useActionState } from "react";
import { createClientRecord, type CreateClientState } from "../actions";

const initialState: CreateClientState = { status: "idle" };

export default function NewClientPage() {
  const [state, formAction, pending] = useActionState(createClientRecord, initialState);

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-2xl font-semibold text-ink">Add client</h1>
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-ink">
          Name
          <input
            type="text"
            name="primary_contact_name"
            required
            className="rounded-md border border-hairline px-3 py-2 outline-none focus:border-ledger"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Email
          <input
            type="email"
            name="email"
            required
            className="rounded-md border border-hairline px-3 py-2 outline-none focus:border-ledger"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Type
          <select
            name="client_type"
            defaultValue="individual"
            className="rounded-md border border-hairline px-3 py-2 outline-none focus:border-ledger"
          >
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ledger px-3 py-2 font-medium text-white hover:bg-ledger-dark disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add client"}
        </button>
        {state.status === "error" && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}
      </form>
    </div>
  );
}
