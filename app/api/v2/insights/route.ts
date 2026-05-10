import { NextResponse } from "next/server";
import { getPersonalizedCoachingAttachment } from "@/lib/aiNudges/ddbCoaching";
import { getAuthenticatedUserId } from "@/lib/server/cognito-auth";
import { getInsightsForUser } from "@/lib/insights/server";

export const dynamic = "force-static";

export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const firstName = req.headers.get("x-user-first-name") ?? undefined;
  const [insights, personalizedCoaching] = await Promise.all([
    getInsightsForUser({ userId, firstName }),
    getPersonalizedCoachingAttachment(userId).catch(() => undefined),
  ]);
  return NextResponse.json({
    insights,
    ...(personalizedCoaching ? { personalizedCoaching } : {}),
  });
}
