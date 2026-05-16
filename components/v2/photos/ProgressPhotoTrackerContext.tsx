"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  deleteProgressPhoto,
  getProgressPhotos,
  isAwsBackendEnabled,
  postProgressPhotoAssessment,
} from "@/lib/frontend-api-client";
import { track } from "@/lib/analytics";
import { isBodyCompareAiEnabled } from "@/lib/featureFlags";
import { uiPhotoToAssessmentPayload } from "@/lib/progressPhotoAssessmentPayload";
import type { BodyCompareAssessment } from "@/lib/photos/bodyCompareAssessmentCardModel";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { useHealthStore } from "@/lib/store";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { useSaveEntry } from "@/hooks/useHealthActions";

export type ProgressUiPhoto = {
  photoId: string;
  userId: string;
  date: string;
  imageUrl?: string;
  storageKey?: string;
  weightAtPhoto?: number;
  createdAt: string;
  source: "progress" | "legacy";
  legacyEntryId?: string;
};

export type ProgressPhotoTrackerContextValue = {
  today: string | null;
  status: ReturnType<typeof useCognitoAuth>["status"];
  user: ReturnType<typeof useCognitoAuth>["user"];
  getAccessToken: ReturnType<typeof useCognitoAuth>["getAccessToken"];
  canUseCloud: boolean;
  aiCompareEnabled: boolean;
  loadingPhotos: boolean;
  error: string | null;
  syncNotice: string | null;
  setError: (v: string | null) => void;
  displayPhotos: ProgressUiPhoto[];
  comparePhotos: ProgressUiPhoto[];
  compareSelection: string[];
  setCompareSelection: Dispatch<SetStateAction<string[]>>;
  compareAssessment: BodyCompareAssessment | null;
  assessing: boolean;
  previewPhoto: { url: string; date: string; photoId: string } | null;
  setPreviewPhoto: (v: { url: string; date: string; photoId: string } | null) => void;
  onDeletePhoto: (photoId: string) => Promise<void>;
  toggleCompare: (photoId: string) => void;
  runAssessment: (photosToAssess: ProgressUiPhoto[], query: string) => Promise<boolean>;
};

const ProgressPhotoTrackerContext = createContext<ProgressPhotoTrackerContextValue | null>(null);

export function useProgressPhotoTracker(): ProgressPhotoTrackerContextValue {
  const ctx = useContext(ProgressPhotoTrackerContext);
  if (!ctx) {
    throw new Error("useProgressPhotoTracker must be used within ProgressPhotoTrackerProvider");
  }
  return ctx;
}

export function ProgressPhotoTrackerProvider({ children }: { children: ReactNode }) {
  const { status, user, getAccessToken } = useCognitoAuth();
  const entries = useHealthStore((s) => s.entries);
  const saveEntry = useSaveEntry();
  const today = useClientTodayKey();
  const [photos, setPhotos] = useState<ProgressUiPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; date: string; photoId: string } | null>(null);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareAssessment, setCompareAssessment] = useState<BodyCompareAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const canUseCloud = isAwsBackendEnabled() && status === "authenticated";
  const aiCompareEnabled = isBodyCompareAiEnabled(user?.id);

  useEffect(() => {
    if (!canUseCloud) return;
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setLoadingPhotos(true);
    void getProgressPhotos(accessToken)
      .then((res) => {
        if (!res.ok) {
          const hasLegacy = useHealthStore
            .getState()
            .entries.some((e) => typeof e.photoUrl === "string" && e.photoUrl.length > 0);
          if (hasLegacy) {
            setSyncNotice("Extra cloud album unavailable — your log photos still show below.");
            setError(null);
          } else {
            setSyncNotice(null);
            setError(res.error);
          }
          return;
        }
        setPhotos(res.data.items.map((item) => ({ ...item, source: "progress" as const })));
        setSyncNotice(null);
        setError(null);
      })
      .finally(() => setLoadingPhotos(false));
  }, [canUseCloud, getAccessToken]);

  const legacyPhotos = useMemo<ProgressUiPhoto[]>(
    () =>
      entries
        .filter((e) => typeof e.photoUrl === "string" && e.photoUrl.length > 0)
        .map((e) => ({
          photoId: `legacy-${e.id}`,
          userId: "legacy",
          date: e.date,
          imageUrl: e.photoUrl ?? undefined,
          createdAt: new Date(e.date + "T00:00:00Z").toISOString(),
          source: "legacy" as const,
          legacyEntryId: e.id,
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );

  const displayPhotos = useMemo<ProgressUiPhoto[]>(() => {
    const merged: ProgressUiPhoto[] = [...photos];
    const seen = new Set(merged.map((p) => `${p.date}|${p.imageUrl ?? ""}`));
    for (const legacy of legacyPhotos) {
      const key = `${legacy.date}|${legacy.imageUrl ?? ""}`;
      if (!seen.has(key)) {
        merged.push(legacy);
        seen.add(key);
      }
    }
    return merged.sort((a, b) => b.date.localeCompare(a.date));
  }, [photos, legacyPhotos]);

  const comparePhotos = useMemo(() => {
    const selected = displayPhotos.filter((p) => compareSelection.includes(p.photoId));
    return [...selected].sort((a, b) => a.date.localeCompare(b.date));
  }, [displayPhotos, compareSelection]);

  useEffect(() => {
    const valid = new Set(displayPhotos.map((p) => p.photoId));
    setCompareSelection((prev) => prev.filter((id) => valid.has(id)));
  }, [displayPhotos]);

  useEffect(() => {
    if (comparePhotos.length === 2) {
      track("photo_compare_opened", {
        leftDate: comparePhotos[0]?.date,
        rightDate: comparePhotos[1]?.date,
      });
    }
  }, [comparePhotos]);

  const onDeletePhoto = useCallback(
    async (photoId: string) => {
      const existing = displayPhotos.find((p) => p.photoId === photoId);
      if (!existing) return;
      if (existing.source === "legacy" && existing.legacyEntryId) {
        const latest = useHealthStore.getState().entries;
        const entry = latest.find((e) => e.id === existing.legacyEntryId);
        if (!entry) return;
        await saveEntry({ ...entry, photoUrl: null });
        setCompareSelection((prev) => prev.filter((id) => id !== photoId));
        setPreviewPhoto((prev) => (prev?.photoId === photoId ? null : prev));
        track("progress_photo_deleted", { photoId, date: existing.date, source: "legacy" });
        return;
      }
      const accessToken = getAccessToken();
      if (!accessToken) return;
      const res = await deleteProgressPhoto(photoId, accessToken);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPhotos((prev) => prev.filter((p) => p.photoId !== photoId));
      setCompareSelection((prev) => prev.filter((id) => id !== photoId));
      setPreviewPhoto((prev) => (prev?.photoId === photoId ? null : prev));
      track("progress_photo_deleted", { photoId, date: existing?.date });
    },
    [displayPhotos, getAccessToken, saveEntry],
  );

  const toggleCompare = useCallback((photoId: string) => {
    setCompareSelection((prev) => {
      if (prev.includes(photoId)) return prev.filter((id) => id !== photoId);
      if (prev.length >= 2) return [prev[1], photoId];
      return [...prev, photoId];
    });
    setCompareAssessment(null);
  }, []);

  const runAssessment = useCallback(
    async (photosToAssess: ProgressUiPhoto[], query: string): Promise<boolean> => {
      const accessToken = getAccessToken();
      if (!accessToken) return false;
      const payloads = photosToAssess
        .map((p) => uiPhotoToAssessmentPayload({ date: p.date, imageUrl: p.imageUrl }))
        .filter((x): x is NonNullable<typeof x> => x != null);
      if (payloads.length < 2) {
        setError(
          "Need two photos we can send for analysis (JPEG/PNG/WebP/GIF as cloud files or saved in your log).",
        );
        return false;
      }
      setAssessing(true);
      setError(null);
      const res = await postProgressPhotoAssessment(
        {
          photos: payloads,
          query,
        },
        accessToken,
      );
      setAssessing(false);
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      setCompareAssessment({ ...res.data, generatedAt: new Date().toISOString() });
      return true;
    },
    [getAccessToken],
  );

  const value = useMemo<ProgressPhotoTrackerContextValue>(
    () => ({
      today,
      status,
      user,
      getAccessToken,
      canUseCloud,
      aiCompareEnabled,
      loadingPhotos,
      error,
      syncNotice,
      setError,
      displayPhotos,
      comparePhotos,
      compareSelection,
      compareAssessment,
      assessing,
      previewPhoto,
      setPreviewPhoto,
      onDeletePhoto,
      toggleCompare,
      setCompareSelection,
      runAssessment,
    }),
    [
      today,
      status,
      user,
      getAccessToken,
      canUseCloud,
      aiCompareEnabled,
      loadingPhotos,
      error,
      syncNotice,
      displayPhotos,
      comparePhotos,
      compareSelection,
      compareAssessment,
      assessing,
      previewPhoto,
      onDeletePhoto,
      toggleCompare,
      setCompareSelection,
      runAssessment,
    ],
  );

  return (
    <ProgressPhotoTrackerContext.Provider value={value}>{children}</ProgressPhotoTrackerContext.Provider>
  );
}
