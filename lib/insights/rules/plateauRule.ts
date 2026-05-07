import { limitToLast90Days, sortLogsAsc } from "@/lib/insights/helpers";
import {
  evaluatePlateau,
  plateauInsightFromEvaluation,
} from "@/lib/insights/plateauDetection";
import type { InsightRule } from "@/lib/insights/types";

export const plateauRule: InsightRule = (logs, userPrefs) => {
  const scoped = limitToLast90Days(sortLogsAsc(logs));
  const ev = evaluatePlateau(
    scoped.map((l) => ({ date: l.date, morningWeight: l.morningWeight })),
    userPrefs.plateau,
  );
  if (!ev) return null;
  return plateauInsightFromEvaluation(ev);
};
