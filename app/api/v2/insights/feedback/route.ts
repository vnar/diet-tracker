import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/server/cognito-auth";
import { storeInsightFeedback } from "@/lib/insights/server";

export const dynamic = "force-static";

type Body = {
  insightId?: string;
  vote?: "up" | "down";
  comment?: string;
  feedbackType?: "negative";
};

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as Body;
  if (!body.insightId || (body.vote !== "up" && body.vote !== "down")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const comment =
    typeof body.comment === "string" && body.comment.trim().length > 0
      ? body.comment.trim().slice(0, 2000)
      : undefined;
  await storeInsightFeedback({
    userId,
    insightId: body.insightId,
    vote: body.vote,
    comment,
    feedbackType: body.feedbackType === "negative" ? "negative" : undefined,
  });
  return NextResponse.json({ ok: true });
}
