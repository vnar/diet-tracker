"use client";

import { useCallback, useState } from "react";
import { RoadmapInfoCard } from "@/components/v2/roadmap/RoadmapInfoCard";
import { track } from "@/lib/analytics";

const MAX_PREVIEW = 1200;

export function LabsLocalPreviewPanel() {
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    setName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setPreview(text.slice(0, MAX_PREVIEW));
      track("labs_local_preview_loaded", { bytes: text.length });
    };
    reader.onerror = () => {
      setErr("Could not read that file.");
      setPreview(null);
    };
    reader.readAsText(file);
  }, []);

  return (
    <RoadmapInfoCard eyebrow="Labs" title="Preview a file on this device">
      <p>
        Pick a CSV or text export from your lab portal. Preview only — nothing leaves your browser. For
        diagnosis or treatment, always use your clinician.
      </p>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-zinc-500">Choose file</span>
        <input
          type="file"
          accept=".csv,.txt,text/plain,text/csv"
          onChange={onFile}
          className="block w-full text-xs text-zinc-300 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs file:text-zinc-200"
        />
      </label>
      {err ? <p className="text-[11px] text-rose-400">{err}</p> : null}
      {name && preview != null ? (
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-zinc-500">
            Preview of <span className="text-zinc-300">{name}</span> (first {preview.length} chars)
          </p>
          <pre className="max-h-40 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-[10px] leading-relaxed text-zinc-400">
            {preview}
          </pre>
        </div>
      ) : null}
    </RoadmapInfoCard>
  );
}
