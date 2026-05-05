import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/server/cognito-auth";
import { getInsightsForUser } from "@/lib/insights/server";

export const dynamic = "force-static";

export async function GET(req: Request) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const firstName = req.headers.get("x-user-first-name") ?? undefined;
  const insights = await getInsightsForUser({ userId, firstName });
  return NextResponse.json({ insights });
}
