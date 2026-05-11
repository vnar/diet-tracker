import { describe, expect, it } from "vitest";
import {
  validateWeeklyReportEmailPayload,
  WEEKLY_REPORT_EMAIL_HTML_MAX_BYTES,
} from "@/lib/email/weeklyReportEmailPayload";

describe("validateWeeklyReportEmailPayload", () => {
  it("accepts valid html and optional fields", () => {
    const r = validateWeeklyReportEmailPayload({
      htmlBody: "<p>Hello</p>",
      textBody: "Hello",
      subject: "Week",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.htmlBody).toContain("Hello");
      expect(r.value.textBody).toBe("Hello");
      expect(r.value.subject).toBe("Week");
    }
  });

  it("rejects empty html", () => {
    const r = validateWeeklyReportEmailPayload({ htmlBody: "  " });
    expect(r.ok).toBe(false);
  });

  it("rejects oversized html", () => {
    const huge = "x".repeat(WEEKLY_REPORT_EMAIL_HTML_MAX_BYTES + 10);
    const r = validateWeeklyReportEmailPayload({ htmlBody: huge });
    expect(r.ok).toBe(false);
  });
});
