import { describe, expect, it } from "vitest";
import {
  buildMessageId,
  buildMultipartAlternativeRfc822,
  domainFromEmail,
  encodeFromDisplayName,
  encodeRfc2047Subject,
  htmlToPlainTextFallback,
  isFreemailDomain,
  resolveMessageIdDomain,
} from "@/lib/email/rfc822MultipartAlternative";

describe("domainFromEmail", () => {
  it("parses bare address", () => {
    expect(domainFromEmail("user@example.com")).toBe("example.com");
  });
  it("parses angle-addr", () => {
    expect(domainFromEmail(`Display <user@Sub.Example.COM>`)).toBe("sub.example.com");
  });
});

describe("isFreemailDomain", () => {
  it("flags gmail", () => {
    expect(isFreemailDomain("gmail.com")).toBe(true);
  });
  it("does not flag owned domain", () => {
    expect(isFreemailDomain("mail.tryojas.com")).toBe(false);
  });
});

describe("resolveMessageIdDomain", () => {
  it("uses explicit env domain over from", () => {
    expect(resolveMessageIdDomain("a@gmail.com", "mail.product.com")).toBe("mail.product.com");
  });
  it("returns null for gmail from without explicit", () => {
    expect(resolveMessageIdDomain("a@gmail.com", undefined)).toBeNull();
  });
  it("uses from domain for non-freemail", () => {
    expect(resolveMessageIdDomain("noreply@mail.product.com", undefined)).toBe("mail.product.com");
  });
});

describe("buildMessageId", () => {
  it("wraps id with angle brackets", () => {
    const m = buildMessageId("example.com");
    expect(m).toMatch(/^<weekly-[a-f0-9]{32}@example\.com>$/);
  });
});

describe("encodeRfc2047Subject", () => {
  it("passes ASCII through", () => {
    expect(encodeRfc2047Subject("Hello weekly")).toBe("Hello weekly");
  });
  it("encodes emoji", () => {
    const s = encodeRfc2047Subject("Report — week 1");
    expect(s.startsWith("=?UTF-8?B?")).toBe(true);
  });
});

describe("encodeFromDisplayName", () => {
  it("quotes ASCII", () => {
    expect(encodeFromDisplayName("Ojas Health")).toBe('"Ojas Health"');
  });
});

describe("htmlToPlainTextFallback", () => {
  it("strips tags", () => {
    expect(htmlToPlainTextFallback("<p>Hi <b>there</b></p>")).toBe("Hi there");
  });
});

describe("buildMultipartAlternativeRfc822", () => {
  it("builds CRLF multipart with both parts", () => {
    const raw = buildMultipartAlternativeRfc822({
      from: "noreply@mail.example.com",
      fromDisplayName: "Ojas Health",
      to: "user@gmail.com",
      subject: "Weekly report",
      textPlain: "Plain line",
      html: "<p>Hi</p>",
      messageId: "<id@mail.example.com>",
    });
    expect(raw).toContain("\r\n");
    expect(raw).toMatch(/^From: "Ojas Health" <noreply@mail\.example\.com>\r\n/m);
    expect(raw).toContain("multipart/alternative");
    expect(raw).toContain("Content-Transfer-Encoding: base64");
    expect(raw).toContain("MIME-Version: 1.0");
    expect(raw).toContain("X-Auto-Response-Suppress: All");
    expect(raw).toContain("Message-ID: <id@mail.example.com>");
  });

  it("adds List-Unsubscribe-Post only when opt-in and https", () => {
    const withHttps = buildMultipartAlternativeRfc822({
      from: "a@b.co",
      to: "c@d.co",
      subject: "S",
      textPlain: "t",
      html: "<p>x</p>",
      listUnsubscribe: "https://app.example.com/email-prefs",
      listUnsubscribePost: true,
    });
    expect(withHttps).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");

    const httpsNoPost = buildMultipartAlternativeRfc822({
      from: "a@b.co",
      to: "c@d.co",
      subject: "S",
      textPlain: "t",
      html: "<p>x</p>",
      listUnsubscribe: "https://app.example.com/email-prefs",
    });
    expect(httpsNoPost).toContain("List-Unsubscribe: <https://app.example.com/email-prefs>");
    expect(httpsNoPost).not.toContain("List-Unsubscribe-Post:");

    const mailto = buildMultipartAlternativeRfc822({
      from: "a@b.co",
      to: "c@d.co",
      subject: "S",
      textPlain: "t",
      html: "<p>x</p>",
      listUnsubscribe: "mailto:off@example.com",
    });
    expect(mailto).toContain("List-Unsubscribe: <mailto:off@example.com>");
    expect(mailto).not.toContain("List-Unsubscribe-Post:");
  });

  it("omits list semantics when brandListDomain omitted", () => {
    const raw = buildMultipartAlternativeRfc822({
      from: "a@b.co",
      to: "c@d.co",
      subject: "S",
      textPlain: "t",
      html: "<p>x</p>",
    });
    expect(raw).not.toContain("List-ID:");
    expect(raw).not.toContain("Auto-Submitted:");
    expect(raw).not.toContain("List-Unsubscribe:");
  });
});
