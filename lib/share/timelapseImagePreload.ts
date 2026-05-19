/** Preload a single image URL (decode in browser before showing). */
export function preloadTimelapseImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

export type TimelapsePreloadProgress = {
  done: number;
  total: number;
  ready: boolean;
};

/** Preload all timelapse frames; resolves when every URL has loaded or failed once. */
export async function preloadTimelapseImages(
  urls: string[],
  onProgress?: (progress: TimelapsePreloadProgress) => void,
): Promise<{ failed: number }> {
  const total = urls.length;
  if (total === 0) {
    onProgress?.({ done: 0, total: 0, ready: true });
    return { failed: 0 };
  }

  let done = 0;
  let failed = 0;

  const report = () => {
    onProgress?.({ done, total, ready: done >= total });
  };

  report();

  await Promise.all(
    urls.map(async (url) => {
      try {
        await preloadTimelapseImage(url);
      } catch {
        failed += 1;
      } finally {
        done += 1;
        report();
      }
    }),
  );

  return { failed };
}
