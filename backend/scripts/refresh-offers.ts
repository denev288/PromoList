import "dotenv/config";

import type { StoreCode as PrismaStoreCode } from "@prisma/client";

import { refreshMatchesForAllItems } from "../src/lib/offersIngestion";
import { prisma } from "../src/lib/prisma";
import { STORE_CODES } from "../src/lib/store";
import { healthCheck } from "../src/lib/supermarketsApi";

async function main() {
  const stores = [...STORE_CODES] as unknown as PrismaStoreCode[];

  const apiHealthy = await healthCheck();
  if (!apiHealthy) {
    console.warn(
      "Supermarkets API is not reachable. The script will continue and may persist 0 offers.",
    );
  }

  const itemsCount = await prisma.listItem.count();
  if (itemsCount === 0) {
    console.log("No list items found. Add items first at /my-list.");
    return;
  }

  console.log(`Refreshing offers for ${itemsCount} list items...`);

  const summaries = await refreshMatchesForAllItems({
    stores,
    useSearchCache: false,
    replaceExistingMatches: true,
    retryAttempts: 3,
  });

  let totalExternal = 0;
  let totalPersisted = 0;
  let totalMatches = 0;

  for (const summary of summaries) {
    totalExternal += summary.result.externalOffersCount;
    totalPersisted += summary.result.persistedOffersCount;
    totalMatches += summary.result.matchesCount;

    console.log(
      `- ${summary.itemName}: external=${summary.result.externalOffersCount}, persisted=${summary.result.persistedOffersCount}, matches=${summary.result.matchesCount}`,
    );
  }

  console.log(
    `Done. Totals -> external=${totalExternal}, persisted=${totalPersisted}, matches=${totalMatches}`,
  );
}

main()
  .catch((error) => {
    console.error("refresh-offers failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
