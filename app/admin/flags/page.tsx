"use client";

import { useMemo, useState } from "react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import {
  getAdminFlagOverrides,
  isAwsBackendEnabled,
  putAdminFlagOverride,
} from "@/lib/frontend-api-client";

const HARDCODED_ADMIN_EMAIL = "viharnar@gmail.com";

type FlagOverrideRow = {
  userId: string;
  flag: string;
  enabled: boolean;
  ts: string;
};

export default function AdminFlagsPage() {
  const { status, user, getAccessToken } = useCognitoAuth();
  const [targetUserId, setTargetUserId] = useState("");
  const [flagName, setFlagName] = useState("FF_INSIGHTS_V2");
  const [enabled, setEnabled] = useState(true);
  const [rows, setRows] = useState<FlagOverrideRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = useMemo(
    () => user?.email?.toLowerCase() === HARDCODED_ADMIN_EMAIL,
    [user?.email],
  );

  async function loadOverrides() {
    if (!targetUserId.trim()) {
      setError("Enter a target userId to fetch overrides.");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setError("Session expired. Please sign in again.");
      return;
    }
    try {
      const result = await getAdminFlagOverrides(targetUserId.trim(), token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setRows(result.data.overrides);
    } catch {
      setError("Failed to load overrides. Please retry.");
    }
  }

  async function saveOverride() {
    if (!targetUserId.trim()) {
      setError("Enter a target userId before saving.");
      return;
    }
    if (!flagName.trim()) {
      setError("Flag name is required.");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setError("Session expired. Please sign in again.");
      return;
    }
    setSaving(true);
    try {
      const result = await putAdminFlagOverride(
        { userId: targetUserId.trim(), flag: flagName.trim(), enabled },
        token,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      await loadOverrides();
    } catch {
      setError("Failed to save override. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  if (!isAwsBackendEnabled()) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-sm text-zinc-300">
        Admin flags require AWS backend mode.
      </main>
    );
  }

  if (status !== "authenticated") {
    return (
      <main className="mx-auto max-w-2xl p-6 text-sm text-zinc-300">
        Sign in to access admin flags.
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-sm text-rose-300">
        Forbidden: admin access only.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-200">
      <h1 className="text-xl font-semibold">Admin Feature Flags</h1>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <label className="mb-2 block text-xs text-zinc-400">Target userId</label>
        <input
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
          placeholder="cognito-sub-user-id"
        />
        <label className="mb-2 block text-xs text-zinc-400">Flag</label>
        <input
          value={flagName}
          onChange={(e) => setFlagName(e.target.value)}
          className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
          placeholder="FF_INSIGHTS_V2"
        />
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadOverrides()}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            Load
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveOverride()}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save override"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="mb-2 text-sm font-medium text-zinc-300">Current overrides</h2>
        {rows.length === 0 ? (
          <p className="text-xs text-zinc-500">No overrides loaded.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={`${row.userId}:${row.flag}`} className="rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-xs">
                <p>
                  <span className="text-zinc-400">flag:</span> {row.flag}
                </p>
                <p>
                  <span className="text-zinc-400">enabled:</span> {String(row.enabled)}
                </p>
                <p>
                  <span className="text-zinc-400">updated:</span> {row.ts || "n/a"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
