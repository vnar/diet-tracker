import { Scale } from "lucide-react";
import { displayWeight } from "@/lib/units";

type Props = {
  weightKg: number;
  unit: "kg" | "lbs";
  /** Thumbnail strip vs full lightbox overlay */
  variant?: "thumb" | "lightbox";
};

/** Top-left weight chip for progress photos (kg stored, shown in user unit). */
export function ProgressPhotoWeightBadge({ weightKg, unit, variant = "thumb" }: Props) {
  const value = displayWeight(weightKg, unit);

  if (variant === "lightbox") {
    return (
      <div
        className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-gradient-to-br from-black/90 via-emerald-950/75 to-black/85 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
        aria-label={`Weight ${value} ${unit}`}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15">
          <Scale className="h-4 w-4 text-emerald-300" aria-hidden />
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-200/80">Weight</span>
          <span className="mt-0.5 flex items-baseline gap-1">
            <span className="text-lg font-semibold tabular-nums tracking-tight text-white">{value}</span>
            <span className="text-xs font-medium text-emerald-200/90">{unit}</span>
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute left-1.5 top-1.5 z-20 flex max-w-[calc(100%-2.5rem)] items-center gap-1 rounded-lg border border-emerald-400/35 bg-gradient-to-br from-black/90 to-emerald-950/80 px-1.5 py-0.5 shadow-md backdrop-blur-sm"
      aria-label={`Weight ${value} ${unit}`}
    >
      <Scale className="h-2.5 w-2.5 shrink-0 text-emerald-300" aria-hidden />
      <span className="truncate text-[10px] font-semibold tabular-nums text-white">{value}</span>
      <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wide text-emerald-200/90">{unit}</span>
    </div>
  );
}
