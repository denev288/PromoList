import type { StoreCode as PrismaStoreCode } from "@prisma/client";
import { NextResponse } from "next/server";

import { refreshMatchesForItem } from "@backend/lib/offersIngestion";
import { prisma } from "@backend/lib/prisma";
import { parseStoresParam } from "@backend/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SortMode = "price" | "score";

type MatchRows = Awaited<ReturnType<typeof loadMatchesForItem>>;

type DealOffer = {
  id: string;
  storeCode: string;
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

const SOFIA_DATE_KEY_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Sofia",
});

function parseSortMode(raw: string | null): SortMode {
  return raw === "score" ? "score" : "price";
}

function byPrice(left: DealOffer, right: DealOffer): number {
  return left.priceValue - right.priceValue || right.score - left.score;
}

function byScore(left: DealOffer, right: DealOffer): number {
  return right.score - left.score || left.priceValue - right.priceValue;
}

async function loadMatchesForItem(itemId: string, stores: PrismaStoreCode[]) {
  return prisma.offerMatch.findMany({
    where: {
      listItemId: itemId,
      offer: {
        store: {
          code: {
            in: stores,
          },
        },
      },
    },
    include: {
      offer: {
        include: {
          store: true,
        },
      },
    },
  });
}

function mapOffers(matches: MatchRows): DealOffer[] {
  return matches.map((match) => ({
    id: match.offer.id,
    storeCode: match.offer.store.code,
    storeName: match.offer.store.name,
    title: match.offer.titleRaw,
    normalizedTitle: match.offer.normalizedTitle,
    priceValue: Number(match.offer.priceValue),
    priceUnit: match.offer.priceUnit,
    promo: match.offer.promo,
    score: match.score,
    reason: match.reason,
    validFrom: match.offer.validFrom ? match.offer.validFrom.toISOString() : null,
    validTo: match.offer.validTo ? match.offer.validTo.toISOString() : null,
    sourceUrl: match.offer.sourceUrl,
    alternative: false,
  }));
}

function toSofiaDateKey(value: Date): string {
  return SOFIA_DATE_KEY_FORMATTER.format(value);
}

function parseDateKey(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return toSofiaDateKey(parsed);
}

function isOfferActive(offer: DealOffer, todayKey: string): boolean {
  const validFromKey = parseDateKey(offer.validFrom);
  const validToKey = parseDateKey(offer.validTo);

  if (validFromKey && validFromKey > todayKey) {
    return false;
  }
  if (validToKey && validToKey < todayKey) {
    return false;
  }

  return true;
}

function sortOffersForItem(type: "generic" | "preferred", offers: DealOffer[], sort: SortMode): DealOffer[] {
  if (type === "generic") {
    return offers.slice().sort(byPrice).slice(0, 5);
  }

  const sorter = sort === "score" ? byScore : byPrice;
  const closeMatches = offers.filter((offer) => offer.score >= 0.45).sort(sorter);
  const alternatives = offers
    .filter((offer) => offer.score < 0.45)
    .map((offer) => ({
      ...offer,
      alternative: true,
    }))
    .sort(sorter);

  return [...closeMatches, ...alternatives];
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const selectedStores = parseStoresParam(url.searchParams.get("stores")) as unknown as PrismaStoreCode[];
  const sortMode = parseSortMode(url.searchParams.get("sort"));
  const includeExpired = url.searchParams.get("includeExpired") === "1";
  const todayKey = toSofiaDateKey(new Date());

  const items = await prisma.listItem.findMany({
    orderBy: [{ favorite: "desc" }, { createdAt: "asc" }],
  });

  const result: Array<{
    item: {
      id: string;
      name: string;
      type: "generic" | "preferred";
      preferredQuery: string | null;
      favorite: boolean;
    };
    offers: DealOffer[];
    fetchedOnDemand: boolean;
  }> = [];

  for (const item of items) {
    let matches = await loadMatchesForItem(item.id, selectedStores);
    let fetchedOnDemand = false;

    if (matches.length === 0) {
      const refresh = await refreshMatchesForItem(item, selectedStores, {
        useSearchCache: true,
        replaceExistingMatches: false,
        retryAttempts: 3,
      });

      fetchedOnDemand = refresh.externalOffersCount > 0;
      matches = await loadMatchesForItem(item.id, selectedStores);
    }

    const allOffers = mapOffers(matches);
    const activeOffers = includeExpired
      ? allOffers
      : allOffers.filter((offer) => isOfferActive(offer, todayKey));
    const offers = sortOffersForItem(item.type, activeOffers, sortMode);

    result.push({
      item: {
        id: item.id,
        name: item.name,
        type: item.type,
        preferredQuery: item.preferredQuery,
        favorite: item.favorite,
      },
      offers,
      fetchedOnDemand,
    });
  }

  return NextResponse.json({
    items: result,
    generatedAt: new Date().toISOString(),
  });
}
