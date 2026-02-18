import { normalize, tokenize } from "./text";
import { isStore, type Store } from "./store";

export type { Store };

export interface ExternalOffer {
  storeCode: Store;
  titleRaw: string;
  normalizedTitle: string;
  priceValue: number;
  priceUnit: string;
  promo: boolean;
  validFrom?: string | null;
  validTo?: string | null;
  sourceUrl?: string | null;
}

interface DiscountHunterProduct {
  name?: string | null;
  new_price?: number | string | null;
  promotion_starts?: string | null;
  promotion_expires?: string | null;
  store?: string | null;
  image_url?: string | null;
}

interface DiscountHunterPage {
  next?: string | null;
  results?: DiscountHunterProduct[];
}

const REQUEST_TIMEOUT_MS = 10_000;
const PRODUCTS_PATH_CANDIDATES = ["products/", "products", "api/products/", "api/products"];

let cachedProductsPath: string | undefined;

function getBaseUrl(): URL | null {
  const raw = process.env.DISCOUNT_HUNTER_API_BASE_URL?.trim();
  if (!raw) {
    return null;
  }

  try {
    return new URL(raw.endsWith("/") ? raw : `${raw}/`);
  } catch {
    return null;
  }
}

async function fetchJSON<T>(url: URL, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", ".").replace(/[^\d.\-]/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseStoreCode(value: unknown): Store | null {
  const raw = asString(value)?.toLowerCase();
  if (!raw) {
    return null;
  }

  if (isStore(raw)) {
    return raw;
  }

  if (raw.includes("lidl")) {
    return "lidl";
  }
  if (raw.includes("kaufland")) {
    return "kaufland";
  }
  if (raw.includes("billa")) {
    return "billa";
  }

  return null;
}

function mapStoreToApiFilter(store: Store): string {
  switch (store) {
    case "billa":
      return "Billa";
    case "kaufland":
      return "Kaufland";
    case "lidl":
      return "Lidl";
  }
}

function capitalizeFirst(value: string): string {
  if (!value) {
    return value;
  }

  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function buildQueryVariants(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const variants = [trimmed, capitalizeFirst(trimmed)];
  return Array.from(new Set(variants));
}

function extractProducts(payload: unknown): DiscountHunterProduct[] {
  if (Array.isArray(payload)) {
    return payload as DiscountHunterProduct[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const page = payload as DiscountHunterPage;
  if (Array.isArray(page.results)) {
    return page.results;
  }

  return [];
}

function getNextPage(payload: unknown, baseUrl: URL): URL | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const page = payload as DiscountHunterPage;
  const next = asString(page.next);
  if (!next) {
    return null;
  }

  try {
    return new URL(next, baseUrl);
  } catch {
    return null;
  }
}

function dedupeOffers(offers: ExternalOffer[]): ExternalOffer[] {
  const deduped = new Map<string, ExternalOffer>();

  for (const offer of offers) {
    const key = [
      offer.storeCode,
      offer.normalizedTitle,
      offer.priceValue.toFixed(2),
      offer.validFrom ?? "-",
      offer.validTo ?? "-",
    ].join("::");

    deduped.set(key, offer);
  }

  return Array.from(deduped.values());
}

function matchesQuery(titleRaw: string, query: string): boolean {
  const normalizedTitle = normalize(titleRaw);
  const normalizedQuery = normalize(query);

  if (!normalizedTitle || !normalizedQuery) {
    return false;
  }

  if (normalizedTitle.includes(normalizedQuery)) {
    return true;
  }

  const queryTokens = tokenize(normalizedQuery);
  const titleTokens = new Set(tokenize(normalizedTitle));

  return queryTokens.some((token) => titleTokens.has(token));
}

function mapProductToOffer(
  product: DiscountHunterProduct,
  requestedStore: Store,
  queryForMatch: string,
): ExternalOffer | null {
  const titleRaw = asString(product.name);
  const priceValue = asNumber(product.new_price);

  if (!titleRaw || priceValue === null || !matchesQuery(titleRaw, queryForMatch)) {
    return null;
  }

  return {
    storeCode: parseStoreCode(product.store) ?? requestedStore,
    titleRaw,
    normalizedTitle: normalize(titleRaw),
    priceValue,
    // TODO: DiscountHunter currently does not expose explicit currency in list payload.
    // We treat prices as EUR for now; add FX conversion in a dedicated layer if needed.
    priceUnit: "EUR",
    promo: true,
    validFrom: asString(product.promotion_starts),
    validTo: asString(product.promotion_expires),
    sourceUrl: asString(product.image_url),
  };
}

async function resolveProductsPath(baseUrl: URL): Promise<string | null> {
  if (cachedProductsPath) {
    return cachedProductsPath;
  }

  for (const path of PRODUCTS_PATH_CANDIDATES) {
    const url = new URL(path, baseUrl);
    url.searchParams.set("page", "1");

    try {
      await fetchJSON<unknown>(url);
      cachedProductsPath = path;
      return path;
    } catch {
      continue;
    }
  }

  return null;
}

async function searchStoreOffers(
  baseUrl: URL,
  productsPath: string,
  apiQuery: string,
  queryForMatch: string,
  store: Store,
): Promise<ExternalOffer[]> {
  const offers: ExternalOffer[] = [];

  let nextUrl: URL | null = new URL(productsPath, baseUrl);
  nextUrl.searchParams.set("search", apiQuery);
  nextUrl.searchParams.set("store", mapStoreToApiFilter(store));
  nextUrl.searchParams.set("page", "1");

  let pageGuard = 0;
  while (nextUrl && pageGuard < 250) {
    pageGuard += 1;

    const payload = await fetchJSON<unknown>(nextUrl);
    const products = extractProducts(payload);

    for (const product of products) {
      const mapped = mapProductToOffer(product, store, queryForMatch);
      if (mapped) {
        offers.push(mapped);
      }
    }

    nextUrl = getNextPage(payload, baseUrl);
  }

  return offers;
}

export async function searchOffers(query: string, stores: Store[]): Promise<ExternalOffer[]> {
  const normalizedQuery = query.trim();
  const baseUrl = getBaseUrl();

  if (!baseUrl || !normalizedQuery) {
    return [];
  }

  const selectedStores = stores.length > 0 ? stores : (["lidl", "kaufland", "billa"] as Store[]);

  try {
    const productsPath = await resolveProductsPath(baseUrl);
    if (!productsPath) {
      return [];
    }

    const allOffers: ExternalOffer[] = [];
    const queryVariants = buildQueryVariants(normalizedQuery);

    for (const store of selectedStores) {
      for (const queryVariant of queryVariants) {
        const offers = await searchStoreOffers(
          baseUrl,
          productsPath,
          queryVariant,
          normalizedQuery,
          store,
        );
        allOffers.push(...offers);
      }
    }

    return dedupeOffers(allOffers);
  } catch {
    return [];
  }
}

export async function healthCheck(): Promise<boolean> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return false;
  }

  const productsPath = await resolveProductsPath(baseUrl);
  if (!productsPath) {
    return false;
  }

  try {
    const url = new URL(productsPath, baseUrl);
    url.searchParams.set("page", "1");

    await fetchJSON<unknown>(url);
    return true;
  } catch {
    return false;
  }
}
