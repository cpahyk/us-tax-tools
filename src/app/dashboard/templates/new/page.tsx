"use client";

import { useState, useTransition } from "react";
import { createTemplate, type TemplateItemInput } from "../actions";

const emptyItem: TemplateItemInput = {
  prompt: "",
  help_text: "",
  response_type: "text",
  is_required: true,
  choices: [],
};

export default function NewTemplatePage() {
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState("");
  const [taxYear, setTaxYear] = useState(currentYear);
  const [items, setItems] = useState<TemplateItemInput[]>([{ ...emptyItem }]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, patch: Partial<TemplateItemInput>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function updateChoice(itemIndex: number, choiceIndex: number, value: string) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== itemIndex) return item;
        const choices = [...(item.choices ?? [])];
        choices[choiceIndex] = value;
        return { ...item, choices };
      })
    );
  }

  function addChoice(itemIndex: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === itemIndex ? { ...item, choices: [...(item.choices ?? []), ""] } : item
      )
    );
  }

  function removeChoice(itemIndex: number, choiceIndex: number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === itemIndex
          ? { ...item, choices: (item.choices ?? []).filter((_, ci) => ci !== choiceIndex) }
          : item
      )
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTemplate({ name, taxYear, items });
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-ink">New organizer template</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-1 text-sm text-ink">
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="1040 Individual"
              required
              className="rounded-md border border-hairline px-3 py-2 outline-none focus:border-ledger"
            />
          </label>
          <label className="flex w-32 flex-col gap-1 text-sm text-ink">
            Tax year
            <input
              type="number"
              value={taxYear}
              onChange={(e) => setTaxYear(Number(e.target.value))}
              className="rounded-md border border-hairline px-3 py-2 outline-none focus:border-ledger"
            />
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-medium text-ink">Questions</h2>
          {items.map((item, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-md border border-hairline bg-white p-4"
            >
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={item.prompt}
                  onChange={(e) => updateItem(index, { prompt: e.target.value })}
                  placeholder="Question"
                  className="flex-1 rounded-md border border-hairline px-3 py-2 outline-none focus:border-ledger"
                />
                <select
                  value={item.response_type}
                  onChange={(e) =>
                    updateItem(index, {
                      response_type: e.target.value as TemplateItemInput["response_type"],
                    })
                  }
                  className="rounded-md border border-hairline px-2 py-2 text-sm"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Yes/No</option>
                  <option value="select">Choice</option>
                  <option value="file">File upload</option>
                </select>
              </div>
              <input
                type="text"
                value={item.help_text}
                onChange={(e) => updateItem(index, { help_text: e.target.value })}
                placeholder="Help text (optional)"
                className="rounded-md border border-hairline px-3 py-2 text-sm outline-none focus:border-ledger"
              />
              {item.response_type === "select" && (
                <div className="flex flex-col gap-2 rounded-md border border-hairline bg-paper p-3">
                  <p className="text-xs font-medium text-ink-muted">Choices</p>
                  {(item.choices ?? []).map((choice, choiceIndex) => (
                    <div key={choiceIndex} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={choice}
                        onChange={(e) => updateChoice(index, choiceIndex, e.target.value)}
                        placeholder={`Choice ${choiceIndex + 1}`}
                        className="flex-1 rounded-md border border-hairline px-2 py-1 text-sm outline-none focus:border-ledger"
                      />
                      <button
                        type="button"
                        onClick={() => removeChoice(index, choiceIndex)}
                        className="text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addChoice(index)}
                    className="w-fit text-xs text-ledger hover:underline"
                  >
                    + Add choice
                  </button>
                  {(item.choices ?? []).filter((c) => c.trim()).length === 0 && (
                    <p className="text-xs text-red-600">
                      Add at least one choice, or clients will get a plain text box instead.
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={item.is_required}
                    onChange={(e) => updateItem(index, { is_required: e.target.checked })}
                  />
                  Required
                </label>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, { ...emptyItem }])}
            className="w-fit rounded-md border border-hairline px-3 py-2 text-sm text-ink hover:border-ledger"
          >
            + Add question
          </button>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-md bg-ledger px-4 py-2 font-medium text-white hover:bg-ledger-dark disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save template"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
