import Link from "next/link";

export default function HomePage() {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <article className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-bold">My List</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Add shopping items, set preferred query, toggle favorites and keep your list clean.
        </p>
        <Link
          href="/my-list"
          className="mt-5 inline-flex rounded-full border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Open My List
        </Link>
      </article>

      <article className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-bold">Deals</h2>
        <p className="mt-2 text-sm text-ink-muted">
          View matched offers from local DB, with on-demand refresh when no cached offers exist.
        </p>
        <Link
          href="/deals"
          className="mt-5 inline-flex rounded-full border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Open Deals
        </Link>
      </article>
    </section>
  );
}
