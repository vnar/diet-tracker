import type { FoodVisionMediaType } from "./visionModel";
export declare function parseS3Uri(photoUrl: string): {
    bucket: string;
    key: string;
} | null;
export declare function s3KeyAllowedForUser(key: string, userId: string): boolean;
/** HEIC/HEIF is common on iPhones; Anthropic vision only supports jpeg/png/gif/webp. */
export declare function isUnsupportedFoodImageFormat(key: string, s3ContentType?: string): boolean;
/** ISO BMFF brands often include "heic" / "mif1" near the start even if Content-Type is wrong. */
export declare function bufferLooksLikeHeicOrHeif(buf: Buffer): boolean;
export declare function guessFoodImageMediaType(key: string, s3ContentType?: string): FoodVisionMediaType;
