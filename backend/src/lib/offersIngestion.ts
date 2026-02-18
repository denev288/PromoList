import {
  Prisma,
  type ListItem,
  type Offer,
  type StoreCode as PrismaStoreCode,
} from "@prisma/client";

import { scoreOfferForItem } from "./matching";
import { prisma } from "./prisma";
import { STORE_CODES, type Store } from "./store";
import { normalize } from "./text";
import { searchOffers, type ExternalOffer } from "./supermarketsApi";

const RATE_LIMIT_MS = 500;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const MAX_MATCHES_PER_ITEM = 75;

const searchCache = new Map<string, { expiresAt: number; data: ExternalOffer[] }>();
let nextRequestAt = 0;

export interface RefreshOptions {
  useSearchCache?: boolean;
  replaceExistingMatches?: boolean;
  retryAttempts?: number;
}

export interface RefreshResult {
  externalOffersCount: number;
  persistedOffersCount: number;
  matchesCount: number;
  skipped: boolean;
}

export interface RefreshSummary {
  itemId: string;
  itemName: string;
  result: RefreshResult;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  if (now < nextRequestAt) {
    await sleep(nextRequestAt - now);
  }
  nextRequestAt = Date.now() + RATE_LIMIT_MS;
}

async function withRetry<T>(task: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError;
}

function toStoreLiteral(code: PrismaStoreCode): Store {
  return code as Store;
}

function toPrismaStoreCode(code: Store): PrismaStoreCode {
  return code as PrismaStoreCode;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildFingerprint(storeId: string, offer: ExternalOffer): string {
  const validFrom = offer.validFrom ?? "-";
  const validTo = offer.validTo ?? "-";
  const sourceUrl = offer.sourceUrl ?? "-";

  return [
    storeId,
    offer.normalizedTitle || normalize(offer.titleRaw),
    offer.priceValue.toFixed(2),
    offer.priceUnit,
    validFrom,
    validTo,
    sourceUrl,
  ].join("::");
}

function searchCacheKey(query: string, stores: Store[]): string {
  return `${query.toLowerCase()}::${stores.slice().sort().join(",")}`;
}

async function fetchExternalOffers(
  query: string,
  stores: Store[],
  useCache: boolean,
  retryAttempts: number,
): Promise<ExternalOffer[]> {
  const key = searchCacheKey(query, stores);

  if (useCache) {
    const cached = searchCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  await waitForRateLimit();

  const offers = await withRetry(() => searchOffers(query, stores), retryAttempts);

  if (useCache) {
    searchCache.set(key, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      data: offers,
    });
  }

  return offers;
}

async function loadStoreIdMap(stores: Store[]): Promise<Map<Store, string>> {
  const rows = await prisma.store.findMany({
    where: {
      code: {
        in: stores.map((store) => toPrismaStoreCode(store)),
      },
    },
  });

  const map = new Map<Store, string>();

  for (const row of rows) {
    map.set(row.code as Store, row.id);
  }

  return map;
}

async function upsertOffer(offer: ExternalOffer, storeId: string): Promise<Offer> {
  const fingerprint = buildFingerprint(storeId, offer);

  return prisma.offer.upsert({
    where: {
      fingerprint,
    },
    update: {
      titleRaw: offer.titleRaw,
      normalizedTitle: offer.normalizedTitle || normalize(offer.titleRaw),
      priceValue: new Prisma.Decimal(offer.priceValue.toFixed(2)),
      priceUnit: offer.priceUnit,
      promo: offer.promo,
      validFrom: parseDate(offer.validFrom),
      validTo: parseDate(offer.validTo),
      sourceUrl: offer.sourceUrl ?? null,
    },
    create: {
      fingerprint,
      storeId,
      titleRaw: offer.titleRaw,
      normalizedTitle: offer.normalizedTitle || normalize(offer.titleRaw),
      priceValue: new Prisma.Decimal(offer.priceValue.toFixed(2)),
      priceUnit: offer.priceUnit,
      promo: offer.promo,
      validFrom: parseDate(offer.validFrom),
      validTo: parseDate(offer.validTo),
      sourceUrl: offer.sourceUrl ?? null,
    },
  });
}

function scorePersistedOffers(item: ListItem, offers: Offer[]): Array<{
  offerId: string;
  score: number;
  reason: string;
}> {
  const scored = offers
    .map((offer) => {
      const match = scoreOfferForItem(item, {
        titleRaw: offer.titleRaw,
        normalizedTitle: offer.normalizedTitle,
      });

      return {
        offerId: offer.id,
        score: match.score,
        reason: match.reason,
      };
    })
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored.slice(0, MAX_MATCHES_PER_ITEM);
}

async function persistMatches(
  itemId: string,
  matches: Array<{ offerId: string; score: number; reason: string }>,
  replaceExistingMatches: boolean,
): Promise<void> {
  if (replaceExistingMatches) {
    await prisma.offerMatch.deleteMany({
      where: {
        listItemId: itemId,
      },
    });
  }

  for (const match of matches) {
    await prisma.offerMatch.upsert({
      where: {
        listItemId_offerId: {
          listItemId: itemId,
          offerId: match.offerId,
        },
      },
      update: {
        score: match.score,
        reason: match.reason,
      },
      create: {
        listItemId: itemId,
        offerId: match.offerId,
        score: match.score,
        reason: match.reason,
      },
    });
  }
}

export function getQueryForItem(item: Pick<ListItem, "name" | "type" | "preferredQuery">): string {
  if (item.type === "preferred" && item.preferredQuery?.trim()) {
    return item.preferredQuery.trim();
  }

  return item.name.trim();
}

export async function refreshMatchesForItem(
  item: ListItem,
  stores: PrismaStoreCode[],
  options: RefreshOptions = {},
): Promise<RefreshResult> {
  const selectedStores = (stores.length > 0 ? stores : [...STORE_CODES]).map((store) =>
    toStoreLiteral(store),
  );

  const query = getQueryForItem(item);
  if (!query) {
    return {
      externalOffersCount: 0,
      persistedOffersCount: 0,
      matchesCount: 0,
      skipped: true,
    };
  }

  const useSearchCache = options.useSearchCache ?? true;
  const replaceExistingMatches = options.replaceExistingMatches ?? false;
  const retryAttempts = Math.max(1, options.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS);

  const externalOffers = await fetchExternalOffers(
    query,
    selectedStores,
    useSearchCache,
    retryAttempts,
  );

  if (externalOffers.length === 0) {
    if (replaceExistingMatches) {
      await prisma.offerMatch.deleteMany({
        where: {
          listItemId: item.id,
        },
      });
    }

    return {
      externalOffersCount: 0,
      persistedOffersCount: 0,
      matchesCount: 0,
      skipped: false,
    };
  }

  const storeIdMap = await loadStoreIdMap(selectedStores);

  const persistedOffers: Offer[] = [];
  for (const offer of externalOffers) {
    const storeId = storeIdMap.get(offer.storeCode);
    if (!storeId) {
      continue;
    }

    const persisted = await upsertOffer(offer, storeId);
    persistedOffers.push(persisted);
  }

  const matches = scorePersistedOffers(item, persistedOffers);
  await persistMatches(item.id, matches, replaceExistingMatches);

  return {
    externalOffersCount: externalOffers.length,
    persistedOffersCount: persistedOffers.length,
    matchesCount: matches.length,
    skipped: false,
  };
}

export async function refreshMatchesForAllItems(options: {
  stores?: PrismaStoreCode[];
  useSearchCache?: boolean;
  replaceExistingMatches?: boolean;
  retryAttempts?: number;
} = {}): Promise<RefreshSummary[]> {
  const items = await prisma.listItem.findMany({
    orderBy: {
      createdAt: "asc",
    },
  });

  const selectedStores =
    options.stores && options.stores.length > 0
      ? options.stores
      : ([...STORE_CODES] as unknown as PrismaStoreCode[]);

  const summaries: RefreshSummary[] = [];

  for (const item of items) {
    const result = await refreshMatchesForItem(item, selectedStores, {
      useSearchCache: options.useSearchCache,
      replaceExistingMatches: options.replaceExistingMatches,
      retryAttempts: options.retryAttempts,
    });

    summaries.push({
      itemId: item.id,
      itemName: item.name,
      result,
    });
  }

  return summaries;
}
