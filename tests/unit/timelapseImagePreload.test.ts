import { describe, expect, it, vi, afterEach } from "vitest";
import { preloadTimelapseImage, preloadTimelapseImages } from "@/lib/share/timelapseImagePreload";

describe("timelapseImagePreload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves when Image onload fires", async () => {
    vi.stubGlobal("Image", class {
      decoding = "async";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    });
    await expect(preloadTimelapseImage("https://example.com/a.jpg")).resolves.toBeUndefined();
  });

  it("reports progress when batch preloading", async () => {
    vi.stubGlobal("Image", class {
      decoding = "async";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    });
    const progress: number[] = [];
    await preloadTimelapseImages(["a", "b"], (p) => progress.push(p.done));
    expect(progress).toEqual([0, 1, 2]);
  });
});
