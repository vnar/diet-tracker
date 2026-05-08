import { describe, expect, it } from "vitest";
import {
  httpsUrlLooksLikeAwsS3ObjectUrl,
  isPhotoAiAssessable,
  uiPhotoToAssessmentPayload,
} from "@/lib/progressPhotoAssessmentPayload";

describe("uiPhotoToAssessmentPayload", () => {
  it("accepts s3 uri", () => {
    const p = uiPhotoToAssessmentPayload({
      date: "2026-05-01",
      imageUrl: "s3://bucket/user/2026-05-01/x.jpg",
    });
    expect(p).toEqual({
      date: "2026-05-01",
      photoUrl: "s3://bucket/user/2026-05-01/x.jpg",
    });
  });

  it("accepts data-url jpeg", () => {
    const p = uiPhotoToAssessmentPayload({
      date: "2026-05-02",
      imageUrl: "data:image/jpeg;base64,abcd",
    });
    expect(p).toEqual({
      date: "2026-05-02",
      imageBase64: "abcd",
      mediaType: "image/jpeg",
    });
  });

  it("accepts data-url jpg alias and charset before base64", () => {
    expect(
      uiPhotoToAssessmentPayload({
        date: "2026-05-02",
        imageUrl: "data:image/jpg;base64,xy",
      }),
    ).toEqual({ date: "2026-05-02", imageBase64: "xy", mediaType: "image/jpeg" });
    expect(
      uiPhotoToAssessmentPayload({
        date: "2026-05-02",
        imageUrl: "data:image/jpeg;charset=UTF-8;base64,zz",
      }),
    ).toEqual({ date: "2026-05-02", imageBase64: "zz", mediaType: "image/jpeg" });
  });

  it("rejects non-image data url", () => {
    expect(
      uiPhotoToAssessmentPayload({ date: "2026-05-02", imageUrl: "data:text/plain;base64,xx" }),
    ).toBeNull();
  });

  it("isPhotoAiAssessable mirrors payload", () => {
    expect(isPhotoAiAssessable({ date: "d", imageUrl: "s3://a/b" })).toBe(true);
    expect(isPhotoAiAssessable({ date: "d", imageUrl: "https://x/y" })).toBe(false);
  });

  it("accepts presigned S3 https URL (virtual-hosted)", () => {
    const url =
      "https://my-photos.s3.us-east-1.amazonaws.com/user-1/2026-05-04/x.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=x";
    expect(httpsUrlLooksLikeAwsS3ObjectUrl(url)).toBe(true);
    expect(uiPhotoToAssessmentPayload({ date: "2026-05-04", imageUrl: url })).toEqual({
      date: "2026-05-04",
      photoUrl: url,
    });
  });

  it("accepts path-style S3 https URL", () => {
    const url = "https://s3.eu-west-1.amazonaws.com/mybucket/some/key.jpg";
    expect(httpsUrlLooksLikeAwsS3ObjectUrl(url)).toBe(true);
    expect(isPhotoAiAssessable({ date: "d", imageUrl: url })).toBe(true);
  });
});
