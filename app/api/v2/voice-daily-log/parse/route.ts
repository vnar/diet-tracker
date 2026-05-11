import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/server/cognito-auth";
import { parseVoiceDailyTranscriptWithAnthropic } from "@/lib/voiceDailyLog/parseTranscript";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const transcript =
    typeof body === "object" &&
    body !== null &&
    "transcript" in body &&
    typeof (body as { transcript: unknown }).transcript === "string"
      ? (body as { transcript: string }).transcript
      : "";

  if (!transcript.trim()) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  const result = await parseVoiceDailyTranscriptWithAnthropic(transcript);
  if (!result.ok) {
    const status = result.error === "no_api_key" ? 503 : 422;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, parsed: result.parsed });
}
