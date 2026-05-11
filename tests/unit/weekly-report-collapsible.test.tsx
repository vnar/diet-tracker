import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyReportCollapsible } from "@/components/v2/weeklyReport/WeeklyReportCollapsible";
import { clearUserFlagOverrides, setUserFlagOverrides } from "@/lib/featureFlags";
import { useHealthStore } from "@/lib/store";

vi.mock("@/components/CognitoAuthProvider", () => ({
  useCognitoAuth: () => ({
    status: "authenticated",
    user: { id: "user-weekly-1", email: "t@example.com" },
    getAccessToken: () => "test-token",
  }),
}));

vi.mock("@/hooks/useHealthActions", () => ({
  usePatchSettings: () => async () => ({ ok: true as const }),
  useRefreshEntries: () => async () => ({ ok: true as const }),
}));

const getDayMealEntriesMock = vi.fn();
const getProgressPhotosMock = vi.fn();

vi.mock("@/lib/frontend-api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/frontend-api-client")>(
    "@/lib/frontend-api-client",
  );
  return {
    ...actual,
    getDayMealEntries: (...a: unknown[]) => getDayMealEntriesMock(...a),
    getProgressPhotos: (...a: unknown[]) => getProgressPhotosMock(...a),
  };
});

describe("WeeklyReportCollapsible", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_FF_WEEKLY_REPORT", "true");
    getDayMealEntriesMock.mockResolvedValue({ ok: true, data: { items: [] } });
    getProgressPhotosMock.mockResolvedValue({ ok: true, data: { items: [] } });
    useHealthStore.setState({
      entries: [],
      settings: {
        goalWeight: 70,
        startWeight: 80,
        targetDate: "2026-12-31",
        unit: "kg",
        tone: "friendly",
        weeklyDigestEmail: false,
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    clearUserFlagOverrides();
    getDayMealEntriesMock.mockReset();
    getProgressPhotosMock.mockReset();
  });

  it("renders when weekly report flag is enabled for the user", () => {
    render(<WeeklyReportCollapsible />);
    expect(screen.getByText("Weekly report card")).toBeInTheDocument();
  });

  it("renders when per-user override enables flag without public env", () => {
    vi.unstubAllEnvs();
    setUserFlagOverrides("user-weekly-1", { FF_WEEKLY_REPORT: true });
    render(<WeeklyReportCollapsible />);
    expect(screen.getByText("Weekly report card")).toBeInTheDocument();
  });

  it("returns null when flag is off", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_WEEKLY_REPORT", "");
    const { container } = render(<WeeklyReportCollapsible />);
    expect(container.firstChild).toBeNull();
  });
});
