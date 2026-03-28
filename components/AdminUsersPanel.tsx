"use client";

import { useEffect, useState } from "react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { getAdminUsers, isAwsBackendEnabled } from "@/lib/frontend-api-client";
import type { AdminUserRow } from "@/lib/frontend-api-client";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AdminUsersPanel({ open, onClose }: Props) {
  const { status, getAccessToken } = useCognitoAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!isAwsBackendEnabled()) {
      setError("AWS backend is not enabled.");
      return;
    }
    if (status !== "authenticated") {
      setError("Sign in to load users.");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setError("Session expired.");
      return;
    }
    setLoading(true);
    setError(null);
    void getAdminUsers(token)
      .then((res) => {
        if (!res.ok) {
          setError(res.error || "Could not load users.");
          setRows([]);
          setCount(null);
          return;
        }
        setRows(res.data.users);
        setCount(res.data.count);
      })
      .finally(() => setLoading(false));
  }, [open, status, getAccessToken]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-labelledby="admin-users-title"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 id="admin-users-title" className="text-base font-semibold text-zinc-100">
              Registered users (Cognito)
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {count !== null ? (
                <>
                  <span className="font-mono text-zinc-400">{count}</span> unique accounts
                </>
              ) : (
                "—"
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-3 sm:px-4">
          {loading ? (
            <p className="px-2 py-6 text-center text-sm text-zinc-500">Loading…</p>
          ) : error ? (
            <p className="px-2 py-6 text-center text-sm text-rose-400">{error}</p>
          ) : (
            <table className="w-full text-left text-xs text-zinc-300">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="px-2 py-2 font-medium">Email</th>
                  <th className="px-2 py-2 font-medium">First name</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.sub} className="border-b border-zinc-800/80">
                    <td className="max-w-[200px] truncate px-2 py-2 font-mono text-[11px] text-zinc-200">
                      {u.email ?? "—"}
                    </td>
                    <td className="px-2 py-2">{u.firstName ?? u.fullName ?? "—"}</td>
                    <td className="px-2 py-2 text-zinc-500">{u.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="border-t border-zinc-800 px-5 py-3 text-[11px] leading-relaxed text-zinc-500">
          First name uses Cognito <span className="font-mono text-zinc-400">given_name</span>, or the
          first word of <span className="font-mono text-zinc-400">name</span> from sign-up. Users who
          signed up without a name may show a dash.
        </p>
      </div>
    </div>
  );
}
