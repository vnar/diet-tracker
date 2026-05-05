import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/server/cognito-auth";
import { storeInsightFeedback } from "@/lib/insights/server";

export const dynamic = "force-static";

type Body = { insightId?: string; vote?: "up" | "down" };

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as Body;
  if (!body.insightId || (body.vote !== "up" && body.vote !== "down")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  await storeInsightFeedback({ userId, insightId: body.insightId, vote: body.vote });
  return NextResponse.json({ ok: true });
}
