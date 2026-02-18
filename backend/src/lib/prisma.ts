import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
  var __prismaClient: PrismaClient | undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
  });
}

export const prisma = global.__prismaClient ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prismaClient = prisma;
}
