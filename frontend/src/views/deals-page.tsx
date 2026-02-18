"use client";

import { useMemo, useState } from "react";

type ItemType = "generic" | "preferred";
type Store = "lidl" | "kaufland" | "billa";
type SortMode = "price" | "score";

type DealOffer = {
  id: string;
  storeCode: Store;
  storeName: string;
  title: string;
  normalizedTitle: string;
  priceValue: number;
  priceUnit: string;
  promo: boolean;
  score: number;
  reason: string;
  validFrom: string | null;
  validTo: string | null;
  sourceUrl: string | null;
  alternative: boolean;
};

type DealItem = {
  item: {
    id: string;
    name: string;
    type: ItemType;
    preferredQuery: string | null;
    favorite: boolean;
  };
  offers: DealOffer[];
  fetchedOnDemand: boolean;
};

type DealsResponse = {
  items: DealItem[];
  generatedAt: string;
};

const STORE_ORDER: Store[] = ["lidl", "kaufland", "billa"];

function formatMoney(value: number, unit: string): string {
  return `${value.toFixed(2)} ${unit}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("bg-BG");
}

export default function DealsPage() {
  const [storeFilter, setStoreFilter] = useState<Record<Store, boolean>>({
    lidl: true,
    kaufland: true,
    billa: true,
  });
  const [sortMode, setSortMode] = useState<SortMode>("price");

  const [deals, setDeals] = useState<DealItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStores = useMemo(
    () => STORE_ORDER.filter((store) => storeFilter[store]),
    [storeFilter],
  );

  const hasNoDeals = deals.length > 0 && deals.every((entry) => entry.offers.length === 0);

  async function loadDeals() {
    if (selectedStores.length === 0) {
      setError("Select at least one store.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        sort: sortMode,
      });

      params.set("stores", selectedStores.join(","));

      const response = await fetch(`/api/deals?${params.toString()}`, {
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as DealsResponse | { error?: string } | null;

      if (!response.ok || !payload || !("items" in payload)) {
        const message = payload && "error" in payload ? payload.error : "Failed to load deals";
        throw new Error(message ?? "Failed to load deals");
      }

      setDeals(payload.items);
      setGeneratedAt(payload.generatedAt);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5">
      <article className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold">Deals</h2>
            <p className="text-sm text-ink-muted">
              Generic items show top 5 cheapest offers. Preferred items show closest matches first.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadDeals()}
            disabled={loading}
            className="inline-flex rounded-full border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh deals"}
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_200px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Stores</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STORE_ORDER.map((store) => (
                <label key={store} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={storeFilter[store]}
                    onChange={(event) =>
                      setStoreFilter((current) => ({
                        ...current,
                        [store]: event.target.checked,
                      }))
                    }
                  />
                  {store}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Sort</p>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="mt-2 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
            >
              <option value="price">price</option>
              <option value="score">score</option>
            </select>
          </div>
        </div>

        {generatedAt ? (
          <p className="mt-4 text-xs text-ink-muted">
            Last response: {new Date(generatedAt).toLocaleString("bg-BG")}
          </p>
        ) : null}
      </article>

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {hasNoDeals ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface-2 px-4 py-4 text-sm text-ink-muted">
          No deals yet - run <code>npm run refresh:offers</code>.
        </p>
      ) : null}

      <div className="space-y-4">
        {deals.map((entry) => (
          <article key={entry.item.id} className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-bold">
                {entry.item.favorite ? "[fav] " : ""}
                {entry.item.name}
              </h3>
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                {entry.item.type}
                {entry.item.preferredQuery ? ` | ${entry.item.preferredQuery}` : ""}
                {entry.fetchedOnDemand ? " | fetched on-demand" : ""}
              </p>
            </div>

            {entry.offers.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-line bg-surface-2 px-4 py-3 text-sm text-ink-muted">
                No cached offers for this item.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {entry.offers.map((offer) => (
                  <li key={`${entry.item.id}-${offer.id}`} className="rounded-2xl border border-line bg-white px-4 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">{offer.title}</p>
                        <p className="text-xs text-ink-muted">
                          {offer.storeName} ({offer.storeCode})
                          {offer.alternative ? " | alternative" : ""}
                          {offer.promo ? " | promo" : ""}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-base font-bold text-accent">
                          {formatMoney(offer.priceValue, offer.priceUnit)}
                        </p>
                        <p className="text-xs text-ink-muted">score: {offer.score.toFixed(2)}</p>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-ink-muted">reason: {offer.reason}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      valid: {formatDate(offer.validFrom)} - {formatDate(offer.validTo)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
