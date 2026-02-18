import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is missing");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const STORES = [
  { code: "lidl", name: "Lidl" },
  { code: "kaufland", name: "Kaufland" },
  { code: "billa", name: "Billa" },
] as const;

async function main() {
  for (const store of STORES) {
    await prisma.store.upsert({
      where: { code: store.code },
      update: { name: store.name },
      create: {
        code: store.code,
        name: store.name,
      },
    });
  }

  console.log(`Seeded ${STORES.length} stores.`);
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
