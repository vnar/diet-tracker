/** Resolve morning weight (kg) for a progress photo from stored value or same-day log. */
export function resolvePhotoWeightKg(
  photo: { date: string; weightAtPhoto?: number },
  morningWeightByDate: ReadonlyMap<string, number>,
): number | undefined {
  if (typeof photo.weightAtPhoto === "number" && Number.isFinite(photo.weightAtPhoto)) {
    return photo.weightAtPhoto;
  }
  const fromLog = morningWeightByDate.get(photo.date);
  return typeof fromLog === "number" && Number.isFinite(fromLog) ? fromLog : undefined;
}
