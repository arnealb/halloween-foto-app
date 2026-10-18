"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-stone-950"
    >
      Afdrukken
    </button>
  );
}
