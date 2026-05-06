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

/** HEIC/HEIF is common on iPhones; Anthropic vision only supports jpeg/png/gif/webp. */
export function isUnsupportedFoodImageFormat(key: string, s3ContentType?: string): boolean {
  const ct = (s3ContentType ?? "").toLowerCase();
  const lower = key.toLowerCase();
  if (ct.includes("heic") || ct.includes("heif")) return true;
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return true;
  return false;
}

/** ISO BMFF brands often include "heic" / "mif1" near the start even if Content-Type is wrong. */
export function bufferLooksLikeHeicOrHeif(buf: Buffer): boolean {
  const n = Math.min(48, buf.length);
  if (n < 12) return false;
  const slice = buf.subarray(0, n);
  const ascii = slice.toString("latin1");
  return ascii.includes("heic") || ascii.includes("mif1") || ascii.includes("heif");
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
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/jpeg";
}
