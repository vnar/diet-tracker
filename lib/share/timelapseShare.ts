import { MARKETING_SITE_URL } from "@/lib/marketing/siteCopy";
import { CANONICAL_PUBLIC_APP_URL, sanitizePublicAppUrl } from "@/lib/share/publicAppUrl";

/** Public timelapse share payload returned by GET /v2/public/share/timelapse/{token}. */
export type PublicTimelapseSharePhoto = {
  photoId: string;
  date: string;
  imageUrl: string;
  weightAtPhoto?: number;
};

export type PublicTimelapseSharePayload = {
  shareId: string;
  unit: "kg" | "lbs";
  includeWeight: boolean;
  expiresAt: string;
  photos: PublicTimelapseSharePhoto[];
};

export type CreateTimelapseShareResponse = {
  shareId: string;
  url: string;
  expiresAt: string;
};

export const TIMELAPSE_SHARE_DEFAULT_EXPIRY_DAYS = 30;

export function buildTimelapseSharePageUrl(
  shareId: string,
  origin = MARKETING_SITE_URL,
): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/share?t=${encodeURIComponent(shareId)}`;
}

/** Origin for share links shown to viewers (never localhost when developing locally). */
export function getTimelapseSharePublicOrigin(): string {
  if (typeof window === "undefined") return CANONICAL_PUBLIC_APP_URL;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    return CANONICAL_PUBLIC_APP_URL;
  }
  return window.location.origin;
}

/** Prefer a public URL; rewrite API localhost links to the canonical share page. */
export function resolveTimelapseSharePageUrl(shareId: string, apiUrl?: string): string {
  const canonical = buildTimelapseSharePageUrl(shareId, getTimelapseSharePublicOrigin());
  if (!apiUrl?.trim()) return canonical;
  if (!sanitizePublicAppUrl(apiUrl)) return canonical;
  try {
    const u = new URL(apiUrl);
    if (u.pathname.replace(/\/+$/, "") !== "/share" || !u.searchParams.get("t")) {
      return canonical;
    }
    return apiUrl.trim();
  } catch {
    return canonical;
  }
}

/** CC0 / Pixabay-friendly upbeat loop bundled for marketing shares. */
export const TIMELAPSE_SHARE_AUDIO_SRC = "/audio/timelapse-share.mp3";
