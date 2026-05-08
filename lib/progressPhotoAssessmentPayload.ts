/** Build API body fragments for POST /v2/progress-photos/assessment (s3 or inline base64). */

export type AssessmentPhotoPayload =
  | { date: string; photoUrl: string }
  | {
      date: string;
      imageBase64: string;
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    };

const INLINE_MAX_B64_CHARS = 6_000_000;

/**
 * True when the URL is shaped like an AWS S3 object URL (virtual-hosted, path-style, or legacy global).
 * Matches server-side normalizePhotoReference in http-api-handler so presigned https:// URLs from list-entries
 * still count as assessable (server re-normalizes to s3:// and uses GetObject).
 */
export function httpsUrlLooksLikeAwsS3ObjectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    if (!path) return false;

    const virtualHosted = host.match(/^(.+)\.s3[.-][a-z0-9-]+\.amazonaws\.com$/);
    if (virtualHosted?.[1]) return true;

    const globalHosted = host.match(/^(.+)\.s3\.amazonaws\.com$/);
    if (globalHosted?.[1]) return true;

    if (/^s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(host) || host === "s3.amazonaws.com") {
      const slash = path.indexOf("/");
      return slash > 0 && slash < path.length - 1;
    }
    return false;
  } catch {
    return false;
  }
}

export function uiPhotoToAssessmentPayload(photo: {
  date: string;
  imageUrl?: string;
}): AssessmentPhotoPayload | null {
  const u = photo.imageUrl;
  if (!u || !photo.date) return null;
  if (u.startsWith("s3://")) {
    return { date: photo.date, photoUrl: u };
  }
  if (u.startsWith("https://") || u.startsWith("http://")) {
    if (httpsUrlLooksLikeAwsS3ObjectUrl(u)) {
      return { date: photo.date, photoUrl: u };
    }
    return null;
  }
  if (!u.startsWith("data:image/")) return null;
  const b64Marker = ";base64,";
  const b64Idx = u.toLowerCase().indexOf(b64Marker);
  if (b64Idx === -1) return null;
  const header = u.slice("data:".length, b64Idx);
  const mimeRaw = (header.includes(";") ? header.slice(0, header.indexOf(";")) : header).trim().toLowerCase();
  const normalized =
    mimeRaw === "image/jpg" || mimeRaw === "image/pjpeg" ? "image/jpeg" : mimeRaw;
  const mediaType = normalized as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  if (mediaType !== "image/jpeg" && mediaType !== "image/png" && mediaType !== "image/gif" && mediaType !== "image/webp") {
    return null;
  }
  const imageBase64 = u.slice(b64Idx + b64Marker.length).replace(/\s/g, "");
  if (imageBase64.length > INLINE_MAX_B64_CHARS) return null;
  return { date: photo.date, imageBase64, mediaType };
}

export function isPhotoAiAssessable(photo: { date: string; imageUrl?: string }): boolean {
  return uiPhotoToAssessmentPayload(photo) !== null;
}
