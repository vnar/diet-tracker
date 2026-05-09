import type { DailyEntry, UserSettings } from "@/src/contracts/types";
import { getAwsApiBaseUrl } from "@/src/api/url";
import { isAwsBackendEnabled } from "@/src/config/env";

type JsonRecord = Record<string, unknown>;

async function readJsonSafe<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

function buildAwsUrl(path: string): string | null {
  const baseUrl = getAwsApiBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  accessToken?: string,
  timeoutMs = 20000,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!isAwsBackendEnabled()) {
    return { ok: false, error: "Couldn’t sync your data right now." };
  }
  try {
    const url = buildAwsUrl(path);
    if (!url) {
      return { ok: false, error: "Couldn’t sync your data right now." };
    }
    const headers = new Headers(init?.headers);
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
      headers.set("x-cognito-access-token", accessToken);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    clearTimeout(timeout);
    const payload = await readJsonSafe<JsonRecord>(res);
    if (!res.ok) {
      return {
        ok: false,
        error:
          typeof payload?.error === "string" ? payload.error : `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: payload as T };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Request timed out. Please try again." };
    }
    return { ok: false, error: "Couldn’t reach the server. Try again." };
  }
}

export async function getEntries(accessToken: string) {
  return fetchJson<{ entries: DailyEntry[] }>("/entries", undefined, accessToken);
}

export async function getSettings(accessToken: string) {
  return fetchJson<{ settings: UserSettings }>("/settings", undefined, accessToken);
}

export async function putEntry(entry: DailyEntry, accessToken: string) {
  return fetchJson<{ entry: DailyEntry }>(
    "/entries",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    },
    accessToken,
  );
}
