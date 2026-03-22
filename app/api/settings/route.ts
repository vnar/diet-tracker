import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { settingsPatchSchema } from "@/lib/server/entry-schema";
import { mapDbSettings } from "@/lib/server/map-entry";
import { defaultSettingsCreate } from "@/lib/server/default-settings";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let row = await prisma.userSettings.findUnique({
    where: { userId },
  });

  if (!row) {
    row = await prisma.userSettings.create({
      data: defaultSettingsCreate(userId),
    });
  }

  return Response.json({ settings: mapDbSettings(row) });
}

export async function PATCH(req: Request) {
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

  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const row = await prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      goalWeight: data.goalWeight,
      startWeight: data.startWeight,
      targetDate: data.targetDate,
      unit: data.unit,
    },
    update: {
      goalWeight: data.goalWeight,
      startWeight: data.startWeight,
      targetDate: data.targetDate,
      unit: data.unit,
    },
  });

  return Response.json({ settings: mapDbSettings(row) });
}
