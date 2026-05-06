import type { FoodVisionMediaType } from "./visionModel";
export declare function parseS3Uri(photoUrl: string): {
    bucket: string;
    key: string;
} | null;
export declare function s3KeyAllowedForUser(key: string, userId: string): boolean;
export declare function guessFoodImageMediaType(key: string, s3ContentType?: string): FoodVisionMediaType;
