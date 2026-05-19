/** Milliseconds between frames when progress-photo timelapse is playing. */
export const PROGRESS_PHOTO_TIMELAPSE_INTERVAL_MS = 900;

export type TimelapsePhoto = {
  photoId: string;
  url: string;
  date: string;
};

/** Oldest → newest — standard order for a body-progress timelapse. */
export function sortPhotosForTimelapse<T extends { date: string }>(photos: T[]): T[] {
  return [...photos].sort((a, b) => a.date.localeCompare(b.date));
}

export function nextTimelapsePhotoId(
  photos: TimelapsePhoto[],
  currentPhotoId: string,
): string | null {
  if (photos.length === 0) return null;
  const idx = photos.findIndex((p) => p.photoId === currentPhotoId);
  if (idx < 0) return photos[0]?.photoId ?? null;
  return photos[(idx + 1) % photos.length]?.photoId ?? null;
}
