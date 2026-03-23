import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dailyEntryUpsertSchema } from "@/lib/server/entry-schema";
import { mapDbEntry } from "@/lib/server/map-entry";

/** Required for `output: 'export'` — handlers are not executed at static build time. */
export const dynamic = "force-static";

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  const rows = await prisma.dailyEntry.findMany({
    where: {
      userId,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "asc" },
  });

  return Response.json({ entries: rows.map(mapDbEntry) });
}

/** Upsert by date (body.date). Used instead of /api/entries/[date] for static export compatibility. */
export async function PUT(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = dailyEntryUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const dateParam = data.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }

  const row = await prisma.dailyEntry.upsert({
    where: {
      userId_date: { userId, date: dateParam },
    },
    create: {
      userId,
      date: dateParam,
      morningWeight: data.morningWeight,
      nightWeight:
        data.nightWeight === null || data.nightWeight === undefined
          ? undefined
          : data.nightWeight,
      calories: data.calories,
      protein: data.protein,
      steps: data.steps,
      sleep: data.sleep,
      lateSnack: data.lateSnack,
      highSodium: data.highSodium,
      workout: data.workout,
      alcohol: data.alcohol,
      photoUrl: data.photoUrl == null ? undefined : data.photoUrl,
      notes: data.notes == null ? undefined : data.notes,
    },
    update: {
      morningWeight: data.morningWeight,
      nightWeight:
        data.nightWeight === null
          ? null
          : data.nightWeight === undefined
            ? undefined
            : data.nightWeight,
      calories: data.calories,
      protein: data.protein,
      steps: data.steps,
      sleep: data.sleep,
      lateSnack: data.lateSnack,
      highSodium: data.highSodium,
      workout: data.workout,
      alcohol: data.alcohol,
      photoUrl: data.photoUrl === null ? null : data.photoUrl,
      notes: data.notes === null ? null : data.notes,
    },
  });

  return Response.json({ entry: mapDbEntry(row) });
}
