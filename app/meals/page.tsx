"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import {
  deleteMealLibrary,
  getMealHistory,
  getMealsList,
  isAwsBackendEnabled,
  patchMealLibrary,
  postDayMealEntry,
  type MealLibraryRow,
} from "@/lib/frontend-api-client";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { MEAL_TYPES, type MealType } from "@/lib/meals/mealTypes";
import { track } from "@/lib/analytics";
import { isMealLibraryEnabled } from "@/lib/featureFlags";

export default function MealsLibraryPage() {
  const { status, getAccessToken, user } = useCognitoAuth();
  const todayKey = useClientTodayKey();
  const [items, setItems] = useState<MealLibraryRow[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<MealType | "all">("all");
  const [sort, setSort] = useState<"frequent" | "recent" | "alpha">("recent");
  const [detail, setDetail] = useState<MealLibraryRow | null>(null);
  const [history, setHistory] = useState<
    Array<{ day: string; nameSnapshot: string; kcal: number | null; proteinG: number | null; loggedAt: string }>
  >([]);
  const [editName, setEditName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const canUse = status === "authenticated" && isAwsBackendEnabled() && user?.id;

  useEffect(() => {
    if (!canUse) return;
    const token = getAccessToken();
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const res = await getMealsList(token, {
        sort,
        limit: 80,
        q: q.trim() || undefined,
        type: type === "all" ? undefined : type,
      });
      if (!cancelled && res.ok) setItems(res.data.items);
    })();
    return () => {
      cancelled = true;
    };
  }, [canUse, sort, q, type]);

  const filtered = useMemo(() => {
    if (type === "all") return items;
    return items.filter((m) => m.mealType === type);
  }, [items, type]);

  async function openDetail(m: MealLibraryRow) {
    setDetail(m);
    setEditName(m.name);
    setMenuOpen(false);
    const token = getAccessToken();
    if (!token) return;
    const h = await getMealHistory(m.id, token);
    if (h.ok) setHistory(h.data.items);
  }

  async function logToday(m: MealLibraryRow) {
    if (!todayKey) return;
    const token = getAccessToken();
    if (!token) return;
    const res = await postDayMealEntry(todayKey, { meal_id: m.id }, token);
    if (res.ok) {
      track("meal_logged_from_library", { mealId: m.id, source: "meals_page" });
      setDetail(null);
    }
  }

  async function saveEdit() {
    if (!detail) return;
    const token = getAccessToken();
    if (!token) return;
    const res = await patchMealLibrary(detail.id, { name: editName.trim() || detail.name }, token);
    if (res.ok) {
      track("meal_edited", { mealId: detail.id });
      setDetail(res.data.meal);
      setItems((prev) => prev.map((x) => (x.id === detail.id ? res.data.meal : x)));
    }
  }

  async function removeMeal() {
    if (!detail) return;
    const token = getAccessToken();
    if (!token) return;
    const res = await deleteMealLibrary(detail.id, token);
    if (res.ok) {
      track("meal_deleted", { mealId: detail.id });
      setDetail(null);
      setItems((prev) => prev.filter((x) => x.id !== detail.id));
    }
  }

  if (!canUse) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-zinc-400">
        <p>Sign in with the cloud backend enabled to use your meal library.</p>
        <Link href="/" className="mt-4 inline-block text-emerald-400 underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  if (user?.id && !isMealLibraryEnabled(user.id)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-zinc-400">
        <p>Meal library is not enabled for your account.</p>
        <Link href="/" className="mt-4 inline-block text-emerald-400 underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-8 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="text-xs text-emerald-400 hover:underline">
              ← Dashboard
            </Link>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Meal library</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs"
              value={sort}
              onChange={(e) => {
                const v = e.target.value as typeof sort;
                setSort(v);
                track("meal_library_filtered", { sort: v });
              }}
            >
              <option value="recent">Most recent</option>
              <option value="frequent">Most logged</option>
              <option value="alpha">Alphabetical</option>
            </select>
          </div>
        </div>

        <input
          className="mb-3 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
          placeholder="Search dishes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => track("meal_library_searched", { q })}
        />

        <div className="mb-4 flex flex-wrap gap-1.5">
          {(["all", ...MEAL_TYPES] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`rounded-full px-3 py-1 text-[11px] capitalize ${
                type === t ? "bg-emerald-600 text-white" : "border border-zinc-700 bg-zinc-900 text-zinc-400"
              }`}
              onClick={() => {
                setType(t);
                track("meal_library_filtered", { mealType: t });
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
            <p>No dishes saved yet.</p>
            <p className="mt-2 text-xs">
              Snap your first meal from the dashboard — choose &quot;Save to my meal library&quot; when you confirm.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void openDetail(m)}
                className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-left transition hover:border-emerald-600/40"
              >
                <span className="line-clamp-2 text-sm font-medium text-zinc-100">{m.name}</span>
                <span className="mt-1 text-[10px] text-zinc-500">
                  {m.timesLogged}× · {m.estKcal} kcal · {m.estProteinG}g protein
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {detail ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs text-zinc-500 hover:text-zinc-300"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
              >
                ⋯
              </button>
            </div>
            {menuOpen ? (
              <div className="mb-3 flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-xs">
                <button
                  type="button"
                  className="rounded px-2 py-1 text-left text-rose-300 hover:bg-rose-950/40"
                  onClick={() => void removeMeal()}
                >
                  Delete from library
                </button>
              </div>
            ) : null}
            <label className="block text-[10px] uppercase text-zinc-500">Name</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <button
              type="button"
              className="mt-2 w-full rounded-lg border border-zinc-700 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={() => void saveEdit()}
            >
              Save name
            </button>
            <p className="mt-2 text-xs capitalize text-zinc-500">{detail.mealType}</p>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              onClick={() => void logToday(detail)}
            >
              Log to today
            </button>
            <div className="mt-4 border-t border-zinc-800 pt-3">
              <p className="text-[10px] font-medium uppercase text-zinc-500">History</p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-zinc-400">
                {history.length === 0 ? <li className="text-zinc-600">No logged days yet.</li> : null}
                {history.map((h, i) => (
                  <li key={`${h.loggedAt}-${i}`}>
                    {h.day} · {h.nameSnapshot} · {h.kcal ?? "—"} kcal
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
