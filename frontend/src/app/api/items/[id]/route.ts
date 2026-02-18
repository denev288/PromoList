import { Prisma, type ListItemType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@backend/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const patchItemSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: z.enum(["generic", "preferred"]).optional(),
  preferredQuery: z.string().trim().max(180).nullable().optional(),
  favorite: z.boolean().optional(),
  toggleFavorite: z.boolean().optional(),
});

export async function DELETE(_: Request, context: RouteContext) {
  const { id } = await context.params;

  const removed = await prisma.listItem.deleteMany({
    where: {
      id,
    },
  });

  if (removed.count === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  const existing = await prisma.listItem.findUnique({
    where: {
      id,
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchItemSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data: Prisma.ListItemUpdateInput = {};

  if (parsed.data.name !== undefined) {
    data.name = parsed.data.name.trim();
  }

  if (parsed.data.type !== undefined) {
    data.type = parsed.data.type as ListItemType;
  }

  if (parsed.data.toggleFavorite === true) {
    data.favorite = !existing.favorite;
  } else if (typeof parsed.data.favorite === "boolean") {
    data.favorite = parsed.data.favorite;
  }

  if (parsed.data.preferredQuery !== undefined) {
    const preferredQuery = parsed.data.preferredQuery?.trim();
    data.preferredQuery = preferredQuery && preferredQuery.length > 0 ? preferredQuery : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const item = await prisma.listItem.update({
    where: {
      id,
    },
    data,
  });

  return NextResponse.json({ item });
}
