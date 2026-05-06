import { afterEach, describe, expect, it } from "vitest";
import {
  isLambdaInsightsLlmRefineEnabled,
  maybeRefineInsightCards,
  type LambdaInsightCard,
} from "../../infra/cdk/lambda/insights-llm-refine.ts";

const baseInsight: LambdaInsightCard = {
  id: "i1",
  ruleId: "baseline",
  priority: 10,
  headline: "Headline original",
  detail: "Detail original",
  why: ["a"],
  action: "Act",
  category: "streak",
};

function clearLlmRefineEnv() {
  delete process.env.INSIGHTS_LLM_REFINE;
  delete process.env.NEXT_PUBLIC_INSIGHTS_LLM_REFINE;
  delete process.env.FF_INSIGHTS_LLM_REFINE;
  delete process.env.NEXT_PUBLIC_FF_INSIGHTS_LLM_REFINE;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.INSIGHT_CACHE_TABLE_NAME;
}

describe("lambda insights LLM refine", () => {
  afterEach(() => {
    clearLlmRefineEnv();
  });

  it("isLambdaInsightsLlmRefineEnabled respects explicit false", () => {
    clearLlmRefineEnv();
    process.env.INSIGHTS_LLM_REFINE = "false";
    expect(isLambdaInsightsLlmRefineEnabled()).toBe(false);
  });

  it("isLambdaInsightsLlmRefineEnabled defaults true when unset", () => {
    clearLlmRefineEnv();
    expect(isLambdaInsightsLlmRefineEnabled()).toBe(true);
  });

  it("maybeRefineInsightCards skips when no API key", async () => {
    clearLlmRefineEnv();
    process.env.ANTHROPIC_API_KEY = "";
    const ddb = {} as import("@aws-sdk/client-dynamodb").DynamoDBClient;
    const out = await maybeRefineInsightCards(ddb, {
      userId: "u1",
      insights: [baseInsight],
      tone: "friendly",
      firstName: "Pat",
      recentNotes: [],
    });
    expect(out).toEqual([{ ...baseInsight, generationSource: "rules" }]);
  });

  it("maybeRefineInsightCards tags rules when refine is disabled", async () => {
    clearLlmRefineEnv();
    process.env.INSIGHTS_LLM_REFINE = "false";
    const ddb = {} as import("@aws-sdk/client-dynamodb").DynamoDBClient;
    const out = await maybeRefineInsightCards(ddb, {
      userId: "u1",
      insights: [baseInsight],
      tone: "friendly",
      firstName: "Pat",
      recentNotes: [],
    });
    expect(out).toEqual([{ ...baseInsight, generationSource: "rules" }]);
  });
});
