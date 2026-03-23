import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSaveEntry } from "@/hooks/useHealthActions";
import { useHealthStore } from "@/lib/store";
import type { DailyEntry, UserSettings } from "@/lib/types";

const getEntriesMock = vi.fn();
const putEntryMock = vi.fn();
const isAwsBackendEnabledMock = vi.fn();
const useCognitoAuthMock = vi.fn();

vi.mock("@/lib/frontend-api-client", () => ({
  getEntries: (...args: unknown[]) => getEntriesMock(...args),
  putEntry: (...args: unknown[]) => putEntryMock(...args),
  patchSettings: vi.fn(),
  isAwsBackendEnabled: (...args: unknown[]) => isAwsBackendEnabledMock(...args),
}));

vi.mock("@/components/CognitoAuthProvider", () => ({
  useCognitoAuth: (...args: unknown[]) => useCognitoAuthMock(...args),
}));

const defaultSettings: UserSettings = {
  goalWeight: 72,
  startWeight: 85,
  targetDate: "2026-12-31",
  unit: "kg",
};

const entry: DailyEntry = {
  id: "today",
  date: "2026-03-23",
  morningWeight: 78,
  lateSnack: false,
  highSodium: false,
  workout: false,
  alcohol: false,
};

describe("useSaveEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useHealthStore.setState({
      entries: [],
      settings: defaultSettings,
    });
    isAwsBackendEnabledMock.mockReturnValue(true);
    useCognitoAuthMock.mockReturnValue({
      status: "authenticated",
      getAccessToken: () => "token",
    });
    putEntryMock.mockResolvedValue({
      ok: true,
      data: { entry },
    });
  });

  it("retries verification and succeeds when entry appears", async () => {
    getEntriesMock
      .mockResolvedValueOnce({ ok: true, data: { entries: [] } })
      .mockResolvedValueOnce({ ok: true, data: { entries: [entry] } });

    const { result } = renderHook(() => useSaveEntry());
    const response = await result.current(entry);

    expect(response.ok).toBe(true);
    expect(putEntryMock).toHaveBeenCalledTimes(1);
    expect(getEntriesMock).toHaveBeenCalledTimes(2);
    expect(useHealthStore.getState().entries).toEqual([entry]);
  });

  it("does not fail save when verification endpoint is transiently unavailable", async () => {
    getEntriesMock
      .mockResolvedValueOnce({ ok: false, error: "Request failed (500)" })
      .mockResolvedValueOnce({ ok: false, error: "Request failed (500)" })
      .mockResolvedValueOnce({ ok: false, error: "Request failed (500)" })
      .mockResolvedValueOnce({ ok: false, error: "Request failed (500)" })
      .mockResolvedValueOnce({ ok: true, data: { entries: [entry] } });

    const { result } = renderHook(() => useSaveEntry());
    const response = await result.current(entry);

    expect(response.ok).toBe(true);
    expect(useHealthStore.getState().entries).toEqual([entry]);
    expect(getEntriesMock).toHaveBeenCalled();
  });
});
