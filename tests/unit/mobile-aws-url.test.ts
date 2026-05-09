import { describe, expect, it } from "vitest";
import { normalizeAwsApiBaseUrl, trimTrailingSlash } from "../../mobile/src/api/urlNormalize";

describe("mobile getAwsApiBaseUrl helpers", () => {
  it("trimTrailingSlash removes trailing slashes", () => {
    expect(trimTrailingSlash("https://a.com/")).toBe("https://a.com");
    expect(trimTrailingSlash("https://a.com///")).toBe("https://a.com");
  });

  it("normalizeAwsApiBaseUrl adds https and trims", () => {
    expect(normalizeAwsApiBaseUrl("")).toBe("");
    expect(normalizeAwsApiBaseUrl("  ")).toBe("");
    expect(normalizeAwsApiBaseUrl("abc.execute-api.us-east-1.amazonaws.com/prod")).toBe(
      "https://abc.execute-api.us-east-1.amazonaws.com/prod",
    );
    expect(normalizeAwsApiBaseUrl("https://x.com/foo/")).toBe("https://x.com/foo");
  });
});
