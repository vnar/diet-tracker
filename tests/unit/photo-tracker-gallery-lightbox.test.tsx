import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoTrackerGallery } from "@/components/v2/photos/PhotoTrackerGallery";

const setPreviewPhoto = vi.fn();
const photos = [
  {
    photoId: "p1",
    userId: "u1",
    date: "2026-05-14",
    imageUrl: "https://example.com/a.jpg",
    weightAtPhoto: 82.5,
    createdAt: "2026-05-14T00:00:00.000Z",
    source: "progress" as const,
  },
  {
    photoId: "p2",
    userId: "u1",
    date: "2026-05-16",
    imageUrl: "https://example.com/b.jpg",
    weightAtPhoto: 80.5,
    createdAt: "2026-05-16T00:00:00.000Z",
    source: "progress" as const,
  },
];

vi.mock("@/lib/store", () => ({
  useHealthStore: (selector: (s: { settings: { unit: "lbs" } }) => unknown) =>
    selector({ settings: { unit: "lbs" } }),
}));

vi.mock("@/components/v2/photos/ProgressPhotoTrackerContext", () => ({
  useProgressPhotoTracker: () => ({
    loadingPhotos: false,
    displayPhotos: photos,
    compareSelection: [],
    comparePhotos: [],
    previewPhoto: { url: photos[1].imageUrl!, date: photos[1].date, photoId: photos[1].photoId },
    setPreviewPhoto,
    onDeletePhoto: vi.fn(),
    toggleCompare: vi.fn(),
    canUseCloud: true,
    aiCompareEnabled: true,
    assessing: false,
    runAssessment: vi.fn(),
    setCompareSelection: vi.fn(),
    compareAssessment: null,
  }),
}));

describe("PhotoTrackerGallery lightbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    setPreviewPhoto.mockClear();
    vi.useRealTimers();
  });

  it("shows prev/next controls and navigates between photos", () => {
    render(<PhotoTrackerGallery />);

    expect(screen.getByRole("dialog", { name: /progress photo preview/i })).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /previous photo/i }));
    expect(setPreviewPhoto).toHaveBeenCalledWith({
      url: photos[0].imageUrl,
      date: photos[0].date,
      photoId: photos[0].photoId,
    });

    fireEvent.click(screen.getByRole("button", { name: /next photo/i }));
    expect(setPreviewPhoto).toHaveBeenLastCalledWith({
      url: photos[0].imageUrl,
      date: photos[0].date,
      photoId: photos[0].photoId,
    });
  });

  it("shows timelapse control and opens oldest photo when started from gallery", () => {
    render(<PhotoTrackerGallery />);

    expect(screen.getByRole("button", { name: /play progress photo timelapse/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /play progress photo timelapse/i }));

    expect(setPreviewPhoto).toHaveBeenCalledWith({
      url: photos[0].imageUrl,
      date: photos[0].date,
      photoId: photos[0].photoId,
    });
    expect(screen.getByRole("button", { name: /pause timelapse/i })).toBeInTheDocument();
  });

  it("shows weight badge on thumbnails and in lightbox", () => {
    render(<PhotoTrackerGallery />);

    expect(screen.getAllByLabelText(/weight 177\.5 lbs/i)).toHaveLength(2);
    expect(screen.getByLabelText(/weight 181\.9 lbs/i)).toBeInTheDocument();
  });
});
