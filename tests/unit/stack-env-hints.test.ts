import { describe, expect, it } from "vitest";
import {
  formatExpoPublicEnvFromStackOutputs,
  formatNextPublicEnvFromStackOutputs,
} from "../../lib/dev/stackEnvHints.mjs";

describe("formatNextPublicEnvFromStackOutputs", () => {
  it("builds .env.local lines from stack outputs", () => {
    const lines = formatNextPublicEnvFromStackOutputs(
      {
        ApiUrl: "https://abc.execute-api.us-east-1.amazonaws.com",
        UserPoolId: "us-east-1_pool",
        UserPoolClientId: "clientid",
        BucketName: "bucket",
      },
      "us-east-1",
    );
    expect(lines).toContain("NEXT_PUBLIC_USE_AWS_BACKEND=true");
    expect(lines).toContain(
      "NEXT_PUBLIC_AWS_API_URL=https://abc.execute-api.us-east-1.amazonaws.com",
    );
    expect(lines).toContain("NEXT_PUBLIC_AWS_REGION=us-east-1");
    expect(lines).toContain("NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_pool");
    expect(lines).toContain("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=clientid");
  });

  it("throws when a required output is missing", () => {
    expect(() =>
      formatNextPublicEnvFromStackOutputs(
        { ApiUrl: "https://x", UserPoolId: "", UserPoolClientId: "c" },
        "us-east-1",
      ),
    ).toThrow(/UserPoolId/);
  });
});

describe("formatExpoPublicEnvFromStackOutputs", () => {
  it("builds mobile/.env lines from stack outputs (trims API URL slash)", () => {
    const lines = formatExpoPublicEnvFromStackOutputs(
      {
        ApiUrl: "https://abc.execute-api.us-east-1.amazonaws.com/",
        UserPoolId: "us-east-1_pool",
        UserPoolClientId: "clientid",
      },
      "us-east-1",
    );
    expect(lines).toContain("EXPO_PUBLIC_USE_AWS_BACKEND=true");
    expect(lines.some((l) => l.includes("EXPO_PUBLIC_AWS_API_URL=https://abc.execute-api.us-east-1.amazonaws.com"))).toBe(
      true,
    );
    expect(lines).toContain("EXPO_PUBLIC_COGNITO_REGION=us-east-1");
    expect(lines).toContain("EXPO_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_pool");
    expect(lines).toContain("EXPO_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=clientid");
  });

  it("throws when a required output is missing", () => {
    expect(() =>
      formatExpoPublicEnvFromStackOutputs(
        { ApiUrl: "https://x", UserPoolId: "", UserPoolClientId: "c" },
        "us-east-1",
      ),
    ).toThrow(/UserPoolId/);
  });
});
