"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PROGRESS_PHOTO_TIMELAPSE_INTERVAL_MS,
  sortPhotosForTimelapse,
  type TimelapsePhoto,
} from "@/lib/photos/progressPhotoTimelapse";

type PreviewPhoto = TimelapsePhoto;

type Args = {
  navigablePhotos: TimelapsePhoto[];
  previewPhoto: PreviewPhoto | null;
  setPreviewPhoto: (v: PreviewPhoto | null) => void;
};

export function useProgressPhotoTimelapse({
  navigablePhotos,
  previewPhoto,
  setPreviewPhoto,
}: Args) {
  const [playing, setPlaying] = useState(false);
  const previewRef = useRef(previewPhoto);
  previewRef.current = previewPhoto;

  const timelapsePhotos = useMemo(
    () => sortPhotosForTimelapse(navigablePhotos),
    [navigablePhotos],
  );

  const canTimelapse = timelapsePhotos.length >= 2;

  const stopTimelapse = useCallback(() => {
    setPlaying(false);
  }, []);

  const openPhoto = useCallback(
    (photo: TimelapsePhoto) => {
      setPreviewPhoto({
        url: photo.url,
        date: photo.date,
        photoId: photo.photoId,
      });
    },
    [setPreviewPhoto],
  );

  const startTimelapse = useCallback(() => {
    if (!canTimelapse) return;
    const current = previewRef.current;
    if (!current) {
      const first = timelapsePhotos[0];
      if (first) openPhoto(first);
    }
    setPlaying(true);
  }, [canTimelapse, timelapsePhotos, openPhoto]);

  const toggleTimelapse = useCallback(() => {
    if (playing) {
      stopTimelapse();
      return;
    }
    startTimelapse();
  }, [playing, startTimelapse, stopTimelapse]);

  const startTimelapseFromGallery = useCallback(() => {
    if (!canTimelapse) return;
    const first = timelapsePhotos[0];
    if (!first) return;
    openPhoto(first);
    setPlaying(true);
  }, [canTimelapse, timelapsePhotos, openPhoto]);

  useEffect(() => {
    if (!previewPhoto) setPlaying(false);
  }, [previewPhoto]);

  useEffect(() => {
    if (!playing || !canTimelapse) return;

    const tick = () => {
      const current = previewRef.current;
      if (!current) return;
      const idx = timelapsePhotos.findIndex((p) => p.photoId === current.photoId);
      const nextIndex = idx < 0 ? 0 : (idx + 1) % timelapsePhotos.length;
      const next = timelapsePhotos[nextIndex];
      if (next) openPhoto(next);
    };

    const id = window.setInterval(tick, PROGRESS_PHOTO_TIMELAPSE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, canTimelapse, timelapsePhotos, openPhoto]);

  return {
    timelapsePhotos,
    canTimelapse,
    timelapsePlaying: playing,
    stopTimelapse,
    startTimelapse,
    startTimelapseFromGallery,
    toggleTimelapse,
  };
}
