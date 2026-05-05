import { isInsightsLlmRefineEnabled } from "@/lib/featureFlags";
import {
  getInsightCache,
  incrementLlmUsage,
  putInsightCache,
} from "@/lib/insights/cacheStore";
import type { Insight, UserPrefs } from "@/lib/insights/types";

const DAILY_LIMIT = 100;

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function refine(insight: Insight, userContext: UserPrefs): Promise<Insight> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !userContext.userId) return insight;
  const cacheKey = `${insight.id}#${dayKey()}`;
  const cached = await getInsightCache({ userId: userContext.userId, cacheKey });
  if (cached) return cached;

  const count = await incrementLlmUsage(userContext.userId);
  if (count > DAILY_LIMIT) return insight;

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const tone = userContext.tone ?? "friendly";
  const notes = (userContext.recentNotes ?? []).slice(-3).join("\n- ");
  const firstName = userContext.firstName ?? "there";
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 180,
    temperature: 0.4,
    system:
      "Rewrite a health insight in a warmer, personalized tone while preserving facts. Return strict JSON with keys headline and detail only.",
    messages: [
      {
        role: "user",
        content: `Tone: ${tone}
First name: ${firstName}
Original headline: ${insight.headline}
Original detail: ${insight.detail ?? ""}
Why points:
- ${insight.why.join("\n- ")}
Recent notes sample:
- ${notes || "None"}`,
      },
    ],
  });
  const text = response.content.find((part) => part.type === "text")?.text;
  if (!text) return insight;
  try {
    const parsed = JSON.parse(text) as { headline?: string; detail?: string };
    const nextInsight = {
      ...insight,
      headline: parsed.headline?.trim() || insight.headline,
      detail: parsed.detail?.trim() || insight.detail,
    };
    await putInsightCache({ userId: userContext.userId, cacheKey, insight: nextInsight });
    return nextInsight;
  } catch {
    return insight;
  }
}

export async function maybeRefineInsight(insight: Insight, userContext: UserPrefs): Promise<Insight> {
  if (!isInsightsLlmRefineEnabled()) {
    return insight;
  }
  return refine(insight, userContext);
}
