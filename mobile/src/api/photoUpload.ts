import { fetchJson } from "@/src/api/ojasApi";

type UploadUrlPayload = {
  uploadUrl: string;
  fileUrl?: string;
  photoUrl?: string;
};

/**
 * Upload a day photo via presigned S3 PUT (same contract as web `uploadPhotoFile`).
 * On **web**, pass `file` from `ImagePickerAsset.file` — do not rely on `fetch(asset.uri)` alone.
 */
export async function uploadDayPhotoFromUri(
  accessToken: string,
  localUri: string | null,
  day: string,
  opts: { fileName: string; contentType: string; extension: string },
  webFile?: File | null,
): Promise<{ ok: true; photoUrl: string } | { ok: false; error: string }> {
  const init = await fetchJson<UploadUrlPayload>(
    "/photos/upload-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: opts.fileName,
        contentType: opts.contentType,
        extension: opts.extension,
        date: day,
      }),
    },
    accessToken,
  );

  if (!init.ok) {
    return { ok: false, error: init.error };
  }

  const { uploadUrl, photoUrl, fileUrl } = init.data;
  if (!uploadUrl) {
    return { ok: false, error: "No upload URL from server." };
  }

  let body: Blob;
  try {
    if (webFile) {
      body = webFile;
    } else if (localUri) {
      const fileRes = await fetch(localUri);
      if (!fileRes.ok) {
        return { ok: false, error: "Could not read the image from the device." };
      }
      body = await fileRes.blob();
    } else {
      return { ok: false, error: "No image data to upload." };
    }
  } catch {
    return { ok: false, error: "Could not read the image. Try another photo." };
  }

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": opts.contentType,
    },
    body,
  });

  if (!put.ok) {
    return { ok: false, error: `Upload failed (${put.status})` };
  }

  const finalUrl = photoUrl ?? fileUrl;
  if (!finalUrl) {
    return { ok: false, error: "Upload succeeded but photo URL missing." };
  }
  return { ok: true, photoUrl: finalUrl };
}
