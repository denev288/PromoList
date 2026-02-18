"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ItemType = "generic" | "preferred";

type ListItem = {
  id: string;
  name: string;
  type: ItemType;
  preferredQuery: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

type ItemDraft = {
  type: ItemType;
  preferredQuery: string;
};

type ItemsResponse = {
  items?: ListItem[];
  error?: string;
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("bg-BG");
}

export default function MyListPage() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [edits, setEdits] = useState<Record<string, ItemDraft>>({});

  const [name, setName] = useState("");
  const [type, setType] = useState<ItemType>("generic");
  const [preferredQuery, setPreferredQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalFavorites = useMemo(
    () => items.filter((item) => item.favorite).length,
    [items],
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/items", { cache: "no-store" });
      const data = (await response.json()) as ItemsResponse;

      if (!response.ok || !data.items) {
        throw new Error(data.error ?? "Failed to load items");
      }

      setItems(data.items);
      setEdits((current) => {
        const next: Record<string, ItemDraft> = { ...current };

        for (const item of data.items ?? []) {
          if (!next[item.id]) {
            next[item.id] = {
              type: item.type,
              preferredQuery: item.preferredQuery ?? "",
            };
          }
        }

        for (const itemId of Object.keys(next)) {
          if (!(data.items ?? []).some((item) => item.id === itemId)) {
            delete next[itemId];
          }
        }

        return next;
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: cleanName,
          type,
          preferredQuery: preferredQuery.trim() || null,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to create item");
      }

      setName("");
      setPreferredQuery("");
      setType("generic");

      await loadItems();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create item");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleFavorite(itemId: string) {
    setError(null);

    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        toggleFavorite: true,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Failed to toggle favorite");
      return;
    }

    await loadItems();
  }

  async function removeItem(itemId: string) {
    setError(null);

    const response = await fetch(`/api/items/${itemId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Failed to delete item");
      return;
    }

    await loadItems();
  }

  async function saveItemDraft(itemId: string) {
    const draft = edits[itemId];
    if (!draft) {
      return;
    }

    setError(null);

    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: draft.type,
        preferredQuery: draft.type === "preferred" ? draft.preferredQuery.trim() || null : null,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Failed to update item");
      return;
    }

    await loadItems();
  }

  function updateDraft(itemId: string, patch: Partial<ItemDraft>) {
    setEdits((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? { type: "generic", preferredQuery: "" }),
        ...patch,
      },
    }));
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <article className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-lg font-bold">Add Item</h2>

        <form className="mt-4 space-y-3" onSubmit={addItem}>
          <label className="block text-sm font-semibold text-ink-muted" htmlFor="item-name">
            Name
          </label>
          <input
            id="item-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="banani, skyr, shunka"
            className="w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
            required
          />

          <label className="block text-sm font-semibold text-ink-muted" htmlFor="item-type">
            Type
          </label>
          <select
            id="item-type"
            value={type}
            onChange={(event) => setType(event.target.value as ItemType)}
            className="w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
          >
            <option value="generic">generic</option>
            <option value="preferred">preferred</option>
          </select>

          <label className="block text-sm font-semibold text-ink-muted" htmlFor="preferred-query">
            Preferred query (optional)
          </label>
          <input
            id="preferred-query"
            value={preferredQuery}
            onChange={(event) => setPreferredQuery(event.target.value)}
            placeholder="kiselo mlyako vereya 2%"
            className="w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
          />

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex rounded-full border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Add item"}
          </button>
        </form>

        <div className="mt-5 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-muted">
          <p>Total items: {items.length}</p>
          <p>Favorites: {totalFavorites}</p>
        </div>
      </article>

      <article className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-lg font-bold">My List</h2>

        {error ? (
          <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {loading ? <p className="mt-4 text-sm text-ink-muted">Loading...</p> : null}

        {!loading && items.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-surface-2 px-4 py-4 text-sm text-ink-muted">
            Your list is empty.
          </p>
        ) : null}

        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const draft = edits[item.id] ?? {
              type: item.type,
              preferredQuery: item.preferredQuery ?? "",
            };

            return (
              <li key={item.id} className="rounded-2xl border border-line bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base font-semibold">
                      {item.favorite ? "[fav] " : ""}
                      {item.name}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-ink-muted">
                      {item.type}
                      {item.preferredQuery ? ` | ${item.preferredQuery}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">Created: {formatDate(item.createdAt)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleFavorite(item.id)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink"
                    >
                      {item.favorite ? "Unfavorite" : "Favorite"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeItem(item.id)}
                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                  <select
                    value={draft.type}
                    onChange={(event) =>
                      updateDraft(item.id, {
                        type: event.target.value as ItemType,
                      })
                    }
                    className="rounded-xl border border-line bg-surface px-2 py-2 text-sm outline-none transition focus:border-accent"
                  >
                    <option value="generic">generic</option>
                    <option value="preferred">preferred</option>
                  </select>

                  <input
                    value={draft.preferredQuery}
                    onChange={(event) =>
                      updateDraft(item.id, {
                        preferredQuery: event.target.value,
                      })
                    }
                    disabled={draft.type === "generic"}
                    placeholder="preferred query"
                    className="rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                  />

                  <button
                    type="button"
                    onClick={() => void saveItemDraft(item.id)}
                    className="rounded-full border border-accent px-4 py-2 text-xs font-semibold text-accent"
                  >
                    Save
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </article>
    </section>
  );
}
