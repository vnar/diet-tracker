import { describe, expect, it } from "vitest";
import { nextTimelapsePhotoId, sortPhotosForTimelapse } from "@/lib/photos/progressPhotoTimelapse";

const photos = [
  { photoId: "new", date: "2026-05-16", url: "https://example.com/b.jpg" },
  { photoId: "old", date: "2026-05-14", url: "https://example.com/a.jpg" },
];

describe("progressPhotoTimelapse", () => {
  it("sorts photos oldest to newest", () => {
    const sorted = sortPhotosForTimelapse(photos);
    expect(sorted.map((p) => p.photoId)).toEqual(["old", "new"]);
  });

  it("advances to the next photo and wraps", () => {
    const sorted = sortPhotosForTimelapse(photos);
    expect(nextTimelapsePhotoId(sorted, "old")).toBe("new");
    expect(nextTimelapsePhotoId(sorted, "new")).toBe("old");
  });
});
