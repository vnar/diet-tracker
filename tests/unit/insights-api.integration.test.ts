import { afterEach, describe, expect, it, vi } from "vitest";
import { getInsightsV2 } from "@/lib/frontend-api-client";

describe("insights v2 API integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hits v2 insights endpoint and returns parsed payload", async () => {
    process.env.NEXT_PUBLIC_AWS_API_URL = "https://api.example.com";
    process.env.NEXT_PUBLIC_USE_AWS_BACKEND = "true";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          insights: [
            {
              id: "sodium-bump-2026-01-10",
              ruleId: "sodiumBump",
              priority: 95,
              headline: "High-sodium days are linked to heavier next-morning weigh-ins.",
              why: ["Seeded test data"],
              action: "Try one lower-sodium dinner swap tonight.",
              category: "sodium",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await getInsightsV2("token-123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.insights[0]?.ruleId).toBe("sodiumBump");
    }
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/v2/insights",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
  });
});
