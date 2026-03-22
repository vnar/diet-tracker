import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mapDbEntry } from "@/lib/server/map-entry";

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
