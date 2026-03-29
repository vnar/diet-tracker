"use client";

import type { DailyEntry, UserSettings } from "@/lib/types";

type JsonRecord = Record<string, unknown>;

function parseBoolEnv(value: string | undefined): boolean {
  return value === "true";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function isAwsBackendEnabled(): boolean {
  const enabled = parseBoolEnv(process.env.NEXT_PUBLIC_USE_AWS_BACKEND);
  const apiUrl = process.env.NEXT_PUBLIC_AWS_API_URL;
  return enabled && typeof apiUrl === "string" && apiUrl.length > 0;
}

function buildAwsUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_AWS_API_URL;
  if (!baseUrl) {
    throw new Error("Missing NEXT_PUBLIC_AWS_API_URL");
  }
  return `${trimTrailingSlash(baseUrl)}${path}`;
}

async function readJsonSafe<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  useAws = false,
  accessToken?: string
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const url = useAws ? buildAwsUrl(path) : path;
  const headers = new Headers(init?.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
    // HTTP API JWT authorizers do not forward Authorization to Lambda; backend reads this for Cognito GetUser.
    headers.set("x-cognito-access-token", accessToken);
  }
  const res = await fetch(url, { ...init, headers });
  const payload = await readJsonSafe<JsonRecord>(res);
  if (!res.ok) {
    return {
      ok: false,
      error:
        typeof payload?.error === "string"
          ? payload.error
          : `Request failed (${res.status})`,
    };
  }
  return { ok: true, data: payload as T };
}

export async function getEntries(accessToken?: string) {
  return fetchJson<{ entries: DailyEntry[] }>("/entries", undefined, true, accessToken);
}

export async function putEntry(entry: DailyEntry, accessToken?: string) {
  return fetchJson<{ entry: DailyEntry }>(
    "/entries",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    },
    true,
    accessToken
  );
}

export async function deleteEntry(date: string, accessToken?: string) {
  const encoded = encodeURIComponent(date);
  return fetchJson<{ ok: true; date: string }>(
    `/entries?date=${encoded}`,
    { method: "DELETE" },
    true,
    accessToken
  );
}

export async function getSettings(accessToken?: string) {
  return fetchJson<{ settings: UserSettings }>(
    "/settings",
    undefined,
    true,
    accessToken
  );
}

export async function patchSettings(settings: UserSettings, accessToken?: string) {
  return fetchJson<{ settings: UserSettings }>(
    "/settings",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    },
    true,
    accessToken
  );
}

export async function getFooterStats(accessToken?: string) {
  return fetchJson<{ users: number; pageViews: number }>("/stats", undefined, true, accessToken);
}

export type AdminUserRow = {
  sub: string;
  email?: string;
  firstName?: string;
  fullName?: string;
  status?: string;
};

export async function getAdminUsers(accessToken?: string) {
  return fetchJson<{ count: number; users: AdminUserRow[] }>(
    "/admin/users",
    undefined,
    true,
    accessToken,
  );
}

export async function trackPageView(accessToken?: string) {
  return fetchJson<{ pageViews: number }>(
    "/metrics/page-view",
    { method: "POST" },
    true,
    accessToken
  );
}

export async function uploadPhotoFile(
  file: File,
  accessToken?: string
): Promise<{
  ok: boolean;
  photoUrl?: string;
  error?: string;
}> {
  if (!isAwsBackendEnabled()) {
    return { ok: false, error: "AWS backend disabled" };
  }

  const uploadInit = await fetchJson<{
    uploadUrl: string;
    fileUrl?: string;
    photoUrl?: string;
  }>(
    "/photos/upload-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      }),
    },
    true,
    accessToken
  );

  if (!uploadInit.ok) {
    return { ok: false, error: uploadInit.error };
  }

  const putRes = await fetch(uploadInit.data.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!putRes.ok) {
    return { ok: false, error: `Photo upload failed (${putRes.status})` };
  }

  const photoUrl = uploadInit.data.photoUrl ?? uploadInit.data.fileUrl;
  if (!photoUrl) {
    return { ok: false, error: "Photo upload init succeeded, but photo URL missing." };
  }

  return { ok: true, photoUrl };
}
