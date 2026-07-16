"use client";

import { useEffect } from "react";

// Root error boundary — renders inside the normal header/layout. Without
// this, any thrown error (a failed action, a dropped DB connection) fell
// through to Next's unbranded default error page.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="page-title">That didn&apos;t go through</h1>
      <p className="lede">
        {error.message || "Nothing was saved. You can try the same action again."}
      </p>
      <button type="button" className="btn" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
