import type { ListItemType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@backend/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["generic", "preferred"]).default("generic"),
  preferredQuery: z.string().trim().max(180).optional().nullable(),
});

export async function GET() {
  const items = await prisma.listItem.findMany({
    orderBy: [{ favorite: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createItemSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const preferredQuery = parsed.data.preferredQuery?.trim();

  const item = await prisma.listItem.create({
    data: {
      name: parsed.data.name.trim(),
      type: parsed.data.type as ListItemType,
      preferredQuery: preferredQuery && preferredQuery.length > 0 ? preferredQuery : null,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
