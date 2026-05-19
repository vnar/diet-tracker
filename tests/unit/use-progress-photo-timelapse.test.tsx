import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProgressPhotoTimelapse } from "@/components/v2/photos/useProgressPhotoTimelapse";

const photos = [
  { photoId: "p1", date: "2026-05-14", url: "https://example.com/a.jpg" },
  { photoId: "p2", date: "2026-05-16", url: "https://example.com/b.jpg" },
];

describe("useProgressPhotoTimelapse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances chronologically while playing", () => {
    const setPreviewPhoto = vi.fn();
    let preview = photos[0];

    const { result } = renderHook(() =>
      useProgressPhotoTimelapse({
        navigablePhotos: photos,
        previewPhoto: preview,
        setPreviewPhoto: (next) => {
          setPreviewPhoto(next);
          if (next) preview = next;
        },
      }),
    );

    act(() => {
      result.current.startTimelapse();
    });

    act(() => {
      vi.advanceTimersByTime(950);
    });

    expect(setPreviewPhoto).toHaveBeenLastCalledWith({
      url: photos[1].url,
      date: photos[1].date,
      photoId: photos[1].photoId,
    });
  });
});
