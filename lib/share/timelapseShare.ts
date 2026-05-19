import { MARKETING_SITE_URL } from "@/lib/marketing/siteCopy";

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

export function buildTimelapseSharePageUrl(shareId: string, origin = MARKETING_SITE_URL): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/share?t=${encodeURIComponent(shareId)}`;
}

/** CC0 / Pixabay-friendly upbeat loop bundled for marketing shares. */
export const TIMELAPSE_SHARE_AUDIO_SRC = "/audio/timelapse-share.mp3";
