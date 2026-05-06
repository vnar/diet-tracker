import type { FoodVisionMediaType } from "./visionModel";

export function parseS3Uri(photoUrl: string): { bucket: string; key: string } | null {
  if (!photoUrl.startsWith("s3://")) return null;
  const rest = photoUrl.slice("s3://".length);
  const i = rest.indexOf("/");
  if (i <= 0) return null;
  return { bucket: rest.slice(0, i), key: rest.slice(i + 1) };
}

export function s3KeyAllowedForUser(key: string, userId: string): boolean {
  return key === userId || key.startsWith(`${userId}/`);
}

export function guessFoodImageMediaType(key: string, s3ContentType?: string): FoodVisionMediaType {
  const ct = (s3ContentType ?? "").toLowerCase();
  if (ct.includes("png")) return "image/png";
  if (ct.includes("gif")) return "image/gif";
  if (ct.includes("webp")) return "image/webp";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "image/jpeg";
  const lower = key.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
