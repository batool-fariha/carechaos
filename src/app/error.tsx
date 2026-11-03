"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-16 text-center" role="alert">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-mute">The page hit an unexpected error{error.digest ? ` (ref ${error.digest})` : ""}. The simulator itself is unaffected.</p>
      <button onClick={reset} className="mt-4 rounded-md border border-line bg-panel2 px-3.5 py-2 text-sm font-medium hover:border-mute/50">
        Try again
      </button>
    </div>
  );
}
