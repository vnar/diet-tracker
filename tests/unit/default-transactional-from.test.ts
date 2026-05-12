import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TRANSACTIONAL_EMAIL_FROM,
  resolveTransactionalEmailFrom,
} from "@/lib/email/defaultTransactionalFrom";

describe("defaultTransactionalFrom", () => {
  const orig = process.env.TRANSACTIONAL_EMAIL_FROM;

  afterEach(() => {
    if (orig === undefined) delete process.env.TRANSACTIONAL_EMAIL_FROM;
    else process.env.TRANSACTIONAL_EMAIL_FROM = orig;
  });

  it("uses default when unset", () => {
    delete process.env.TRANSACTIONAL_EMAIL_FROM;
    expect(resolveTransactionalEmailFrom()).toBe(DEFAULT_TRANSACTIONAL_EMAIL_FROM);
  });

  it("uses env when set", () => {
    process.env.TRANSACTIONAL_EMAIL_FROM = "other@example.com";
    expect(resolveTransactionalEmailFrom()).toBe("other@example.com");
  });

  it("trims env", () => {
    process.env.TRANSACTIONAL_EMAIL_FROM = "  x@y.com  ";
    expect(resolveTransactionalEmailFrom()).toBe("x@y.com");
  });

  it("falls back when env is whitespace only", () => {
    process.env.TRANSACTIONAL_EMAIL_FROM = "   ";
    expect(resolveTransactionalEmailFrom()).toBe(DEFAULT_TRANSACTIONAL_EMAIL_FROM);
  });
});
