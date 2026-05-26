import { describe, expect, it } from "vitest";
import { mapCognitoAuthError } from "@/lib/cognito-map-auth-error";

function err(name: string) {
  const e = new Error(name) as Error & { name: string };
  e.name = name;
  return e;
}

describe("mapCognitoAuthError", () => {
  it("maps known Cognito exception names", () => {
    expect(mapCognitoAuthError(err("NotAuthorizedException"))).toMatch(/Wrong email or password/i);
    expect(mapCognitoAuthError(err("CodeMismatchException"))).toMatch(/Invalid verification code/i);
    expect(mapCognitoAuthError(err("ExpiredCodeException"))).toMatch(/expired/i);
    expect(mapCognitoAuthError(err("InvalidPasswordException"))).toMatch(/policy/i);
    expect(mapCognitoAuthError(err("TooManyRequestsException"))).toMatch(/Too many attempts/i);
    expect(mapCognitoAuthError(err("LimitExceededException"))).toMatch(/Too many attempts/i);
    expect(mapCognitoAuthError(err("CodeDeliveryFailureException"))).toMatch(/couldn't send/i);
    expect(mapCognitoAuthError(err("InvalidEmailRoleAccessPolicyException"))).toMatch(/couldn't send/i);
  });

  it("returns a generic message for unknown errors", () => {
    expect(mapCognitoAuthError(err("SomeOtherException"))).toBe("Authentication failed.");
    expect(mapCognitoAuthError(null)).toBe("Authentication failed.");
  });
});
