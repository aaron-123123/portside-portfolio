import Link from "next/link";

// Catches notFound() from app/engagement/[id]/page.tsx (a bad or stale
// engagement id) with a branded page instead of Next's default 404.
export default function NotFound() {
  return (
    <main className="container">
      <p className="eyebrow">Not found</p>
      <h1 className="page-title">No engagement here</h1>
      <p className="lede">
        This engagement doesn&apos;t exist, or the link is out of date.
      </p>
      <Link href="/" className="back-link">
        ← All engagements
      </Link>
    </main>
  );
}
