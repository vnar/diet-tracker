import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeightChart } from "@/components/WeightChart";
import { useHealthStore } from "@/lib/store";

const trackMock = vi.fn();

vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

describe("WeightChart analytics", () => {
  let ioCallback: IntersectionObserverCallback | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    ioCallback = null;
    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
    useHealthStore.setState({
      entries: [
        {
          id: "2026-05-01",
          date: "2026-05-01",
          morningWeight: 80,
          lateSnack: false,
          highSodium: false,
          workout: false,
          alcohol: false,
        },
        {
          id: "2026-05-02",
          date: "2026-05-02",
          morningWeight: 79.8,
          lateSnack: false,
          highSodium: false,
          workout: false,
          alcohol: false,
        },
      ],
      settings: {
        goalWeight: 72,
        startWeight: 85,
        targetDate: "2026-12-01",
        unit: "kg",
      },
    });

    globalThis.IntersectionObserver = class MockIO implements IntersectionObserver {
      readonly root: Element | null = null;

      readonly rootMargin: string = "";

      readonly thresholds: ReadonlyArray<number> = [];

      constructor(cb: IntersectionObserverCallback) {
        ioCallback = cb;
      }

      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();

      takeRecords = (): IntersectionObserverEntry[] => [];
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    cleanup();
  });

  it("fires chart_viewed once when the chart section intersects", async () => {
    render(<WeightChart />);
    expect(ioCallback).not.toBeNull();
    const entry = {
      isIntersecting: true,
      intersectionRatio: 0.35,
      target: document.createElement("div"),
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: 0,
    } as IntersectionObserverEntry;
    await act(async () => {
      ioCallback!([entry], {} as IntersectionObserver);
    });
    expect(trackMock).toHaveBeenCalledWith(
      "chart_viewed",
      expect.objectContaining({
        chart: "weight_trend",
        entry_count: 2,
        has_trend_line: true,
      }),
    );
    expect(trackMock.mock.calls.filter((c) => c[0] === "chart_viewed").length).toBe(1);
    await act(async () => {
      ioCallback!([entry], {} as IntersectionObserver);
    });
    expect(trackMock.mock.calls.filter((c) => c[0] === "chart_viewed").length).toBe(1);
  });

  it("does not fire chart_viewed when intersection ratio is below threshold", async () => {
    render(<WeightChart />);
    const entry = {
      isIntersecting: true,
      intersectionRatio: 0.05,
      target: document.createElement("div"),
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: 0,
    } as IntersectionObserverEntry;
    await act(async () => {
      ioCallback!([entry], {} as IntersectionObserver);
    });
    expect(trackMock).not.toHaveBeenCalled();
  });
});
