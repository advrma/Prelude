"use client";

import { EmptyState } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        title="Something tripped on the way to the date"
        action={
          <button className="btn btn-primary" onClick={reset}>
            Try again
          </button>
        }
      >
        {error.message || "An unexpected error happened."} Your data is safe; nothing was shared.
      </EmptyState>
    </div>
  );
}
