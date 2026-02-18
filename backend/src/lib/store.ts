export const STORE_CODES = ["lidl", "kaufland", "billa"] as const;

export type Store = (typeof STORE_CODES)[number];

export function isStore(value: string): value is Store {
  return STORE_CODES.includes(value as Store);
}

export function parseStoresParam(raw: string | null): Store[] {
  if (!raw) {
    return [...STORE_CODES];
  }

  const parsed = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is Store => isStore(value));

  return parsed.length > 0 ? Array.from(new Set(parsed)) : [...STORE_CODES];
}
