import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dailyEntryUpsertSchema } from "@/lib/server/entry-schema";
import { mapDbEntry } from "@/lib/server/map-entry";

export async function PUT(
  req: Request,
  context: { params: Promise<{ date: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { date: dateParam } = await context.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
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
  if (data.date !== dateParam) {
    return Response.json({ error: "Date must match URL" }, { status: 400 });
  }

  const row = await prisma.dailyEntry.upsert({
    where: {
      userId_date: { userId, date: dateParam },
    },
    create: {
      userId,
      date: dateParam,
      morningWeight: data.morningWeight,
      nightWeight: data.nightWeight,
      calories: data.calories,
      protein: data.protein,
      steps: data.steps,
      sleep: data.sleep,
      lateSnack: data.lateSnack,
      highSodium: data.highSodium,
      workout: data.workout,
      alcohol: data.alcohol,
      photoUrl: data.photoUrl,
    },
    update: {
      morningWeight: data.morningWeight,
      nightWeight: data.nightWeight,
      calories: data.calories,
      protein: data.protein,
      steps: data.steps,
      sleep: data.sleep,
      lateSnack: data.lateSnack,
      highSodium: data.highSodium,
      workout: data.workout,
      alcohol: data.alcohol,
      photoUrl: data.photoUrl,
    },
  });

  return Response.json({ entry: mapDbEntry(row) });
}
