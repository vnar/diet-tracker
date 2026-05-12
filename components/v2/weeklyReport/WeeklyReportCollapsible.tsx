"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, Loader2, Mail } from "lucide-react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { usePatchSettings, useRefreshEntries } from "@/hooks/useHealthActions";
import { useHealthStore } from "@/lib/store";
import { addDaysKey } from "@/lib/calculations";
import type { ProgressPhoto } from "@/lib/types";
import {
  getDayMealEntries,
  getInsightsV2,
  getProgressPhotos,
  isAwsBackendEnabled,
  postV2WeeklyReportSendEmail,
} from "@/lib/frontend-api-client";
import {
  isInsightsV2Enabled,
  isMealLibraryEnabled,
  isWeeklyReportEmailSendEnabled,
  isWeeklyReportEnabled,
} from "@/lib/featureFlags";
import { track } from "@/lib/analytics";
import {
  attachInsightsForEmail,
  buildWeeklyAggregate,
  buildWeeklyReportEmailHtml,
  buildWeeklyReportEmailPlainText,
  buildWeeklyReportFromRules,
  defaultWeeklyReportEndDate,
  insightsToEmailSnapshot,
  weekWindowInclusive,
  type WeeklyReportDocument,
} from "@/lib/weeklyReport";
import type { WeeklyMealAggRow } from "@/lib/weeklyReport/aggregate";
import { compactWeeklyBulletLines } from "@/lib/weeklyReport/compactBullets";

function MealFetchMapFromRows(
  results: PromiseSettledResult<Awaited<ReturnType<typeof getDayMealEntries>>>[],
  dates: string[],
): Record<string, WeeklyMealAggRow[]> {
  const out: Record<string, WeeklyMealAggRow[]> = {};
  results.forEach((r, i) => {
    const day = dates[i]!;
    if (r.status !== "fulfilled" || !r.value.ok) {
      out[day] = [];
      return;
    }
    out[day] = r.value.data.items.map((m) => ({
      kcal: m.kcal,
      proteinG: m.proteinG,
    }));
  });
  return out;
}

export function WeeklyReportCollapsible() {
  const { status, getAccessToken, user } = useCognitoAuth();
  const entries = useHealthStore((s) => s.entries);
  const settings = useHealthStore((s) => s.settings);
  const patchSettings = usePatchSettings();
  const refreshEntries = useRefreshEntries();
  const enabled = Boolean(user?.id && isWeeklyReportEnabled(user.id));
  const mealLib = Boolean(user?.id && isMealLibraryEnabled(user.id));
  const mailSendEnabled = Boolean(
    user?.id && isWeeklyReportEmailSendEnabled(user.id) && isAwsBackendEnabled(),
  );
  const insightsEmailOption = Boolean(
    user?.id && isInsightsV2Enabled(user.id) && isAwsBackendEnabled(),
  );

  const [weekEnd, setWeekEnd] = useState(() => defaultWeeklyReportEndDate());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<WeeklyReportDocument | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSendInfo, setEmailSendInfo] = useState<string | null>(null);
  const [digestSaving, setDigestSaving] = useState(false);
  const [includeAiInsightsInEmail, setIncludeAiInsightsInEmail] = useState(true);
  const [sessionHidden, setSessionHidden] = useState(false);
  const viewedKeyRef = useRef<string | null>(null);
  const weekEndDateInputRef = useRef<HTMLInputElement>(null);

  const openWeekEndDatePicker = useCallback(() => {
    const el = weekEndDateInputRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      /* showPicker can throw outside a user gesture in some builds */
    }
    el.focus();
    el.click();
  }, []);

  const weekMeta = useMemo(() => weekWindowInclusive(weekEnd), [weekEnd]);
  const dismissKey = `ojas-weekly-report-dismissed-${weekMeta.weekStart}`;

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && sessionStorage.getItem(dismissKey) === "1") {
        setSessionHidden(true);
      }
    } catch {
      /* private mode */
    }
  }, [dismissKey]);

  const generate = useCallback(async () => {
    if (status !== "authenticated" || !user?.id) return;
    const token = getAccessToken();
    if (!token) {
      setError("Sign in again.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isAwsBackendEnabled()) {
        const sync = await refreshEntries();
        if (!sync.ok) {
          setError(sync.error ?? "Could not sync.");
          setLoading(false);
          return;
        }
      }
      const { weekStart, weekEnd: we } = weekWindowInclusive(weekEnd);
      const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysKey(weekStart, i));

      let mealsByDay: Record<string, WeeklyMealAggRow[]> | undefined;
      if (mealLib && isAwsBackendEnabled()) {
        const settled = await Promise.allSettled(dates.map((d) => getDayMealEntries(d, token)));
        mealsByDay = MealFetchMapFromRows(settled, dates);
      }

      let photos: ProgressPhoto[] = [];
      if (isAwsBackendEnabled()) {
        const pr = await getProgressPhotos(token);
        if (pr.ok) photos = pr.data.items;
      }

      const agg = buildWeeklyAggregate({
        weekEnd: we,
        entries,
        mealsByDay,
        photos,
        settings,
      });
      const doc = buildWeeklyReportFromRules(agg);
      setReport(doc);
      setEmailSendInfo(null);
      track("weekly_report_generated", {
        week_start: doc.aggregate.weekStart,
        week_end: doc.aggregate.weekEnd,
        generation_source: doc.generationSource,
        check_in_days: doc.aggregate.checkInDays,
        weigh_in_days: doc.aggregate.weighInDays,
      });
      viewedKeyRef.current = `${doc.aggregate.weekStart}_${doc.aggregate.weekEnd}_${doc.generatedAt}`;
      track("weekly_report_viewed", {
        week_start: doc.aggregate.weekStart,
        week_end: doc.aggregate.weekEnd,
        generation_source: doc.generationSource,
        surface: "inline_after_generate",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build report.");
    } finally {
      setLoading(false);
    }
  }, [status, user?.id, getAccessToken, weekEnd, mealLib, entries, settings, refreshEntries]);

  const onOpenDetails = useCallback(() => {
    if (!enabled || !report) return;
    const vk = `${report.aggregate.weekStart}_${report.aggregate.weekEnd}_${report.generatedAt}`;
    if (viewedKeyRef.current === vk) return;
    viewedKeyRef.current = vk;
    track("weekly_report_viewed", {
      week_start: report.aggregate.weekStart,
      week_end: report.aggregate.weekEnd,
      generation_source: report.generationSource,
      surface: "accordion_open",
    });
  }, [enabled, report]);

  const onToggleWeeklyDigest = useCallback(
    async (enabledDigest: boolean) => {
      setDigestSaving(true);
      setError(null);
      const r = await patchSettings({ weeklyDigestEmail: enabledDigest });
      setDigestSaving(false);
      if (!r.ok) {
        setError(r.error ?? "Could not save digest preference.");
      }
    },
    [patchSettings],
  );

  const onDismiss = useCallback(() => {
    try {
      if (typeof window !== "undefined") sessionStorage.setItem(dismissKey, "1");
    } catch {
      /* noop */
    }
    setSessionHidden(true);
    track("weekly_report_dismissed", {
      week_start: weekMeta.weekStart,
      week_end: weekMeta.weekEnd,
    });
  }, [dismissKey, weekMeta.weekEnd, weekMeta.weekStart]);

  const sendWeeklyEmail = useCallback(
    async (reason: "first" | "resend") => {
      if (!report || !user?.id) return;
      const token = getAccessToken();
      if (!token) {
        setEmailSendInfo("Session expired.");
        return;
      }
      setEmailBusy(true);
      setEmailSendInfo(null);
      track("weekly_report_email_send_clicked", {
        week_start: report.aggregate.weekStart,
        week_end: report.aggregate.weekEnd,
        resend: reason === "resend",
        include_ai_insights: includeAiInsightsInEmail,
      });

      let docForEmail: WeeklyReportDocument = report;
      if (includeAiInsightsInEmail && insightsEmailOption) {
        const ins = await getInsightsV2(token);
        if (ins.ok && ins.data.insights.length > 0) {
          docForEmail = attachInsightsForEmail(report, insightsToEmailSnapshot(ins.data.insights));
        }
      }

      const htmlBody = buildWeeklyReportEmailHtml(docForEmail, { deliverabilityNotice: "userTapSend" });
      const textBody = buildWeeklyReportEmailPlainText(docForEmail, { deliverabilityNotice: "userTapSend" });
      const baseSubject = `[Ojas Health] Your recap (${report.aggregate.weekStart}–${report.aggregate.weekEnd})`;
      const subject = reason === "resend" ? `${baseSubject} (copy)` : baseSubject;
      const r = await postV2WeeklyReportSendEmail({ htmlBody, textBody, subject }, token);
      setEmailBusy(false);
      if (r.ok) {
        const hadAi = Boolean(docForEmail.aiInsightsForEmail?.length);
        track("weekly_report_email_sent", {
          week_start: report.aggregate.weekStart,
          recipient_domain: r.data.to.includes("@") ? r.data.to.split("@")[1] ?? "" : "",
          resend: reason === "resend",
          include_ai_insights: hadAi,
        });
        let info = `Sent · ${r.data.to}`;
        if (includeAiInsightsInEmail && insightsEmailOption && !hadAi) {
          info += " (weekly only — no AI block)";
        }
        setEmailSendInfo(info);
      } else {
        track("weekly_report_email_failed", { week_start: report.aggregate.weekStart, error: r.error });
        setEmailSendInfo(r.error);
      }
    },
    [report, user?.id, getAccessToken, includeAiInsightsInEmail, insightsEmailOption],
  );

  const scrollToToday = useCallback(() => {
    if (!report) return;
    track("next_experiment_clicked", {
      experiment_kind: report.sections.nextExperiment.kind,
      week_start: report.aggregate.weekStart,
    });
    document.getElementById("dashboard-today")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [report]);

  if (!enabled || sessionHidden) return null;

  return (
    <details
      className="group rounded-xl border border-emerald-900/35 bg-gradient-to-b from-emerald-950/15 to-zinc-950/20 open:border-emerald-800/45"
      onToggle={(e) => {
        const el = e.target as HTMLDetailsElement;
        if (el.open) onOpenDetails();
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex min-w-0 flex-1 items-center gap-2">
          <Mail className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          <span className="text-left">Weekly recap</span>
          <span className="hidden text-[11px] font-normal text-zinc-500 sm:inline">Date → Generate → Email</span>
        </span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-zinc-800/80 px-3 pb-3 pt-2.5 text-sm text-zinc-200">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[11rem] max-w-[14rem] flex-1 sm:min-w-[12rem]">
            <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Week ends
            </span>
            <div className="flex rounded-lg border border-zinc-700 bg-zinc-900 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/80">
              <input
                ref={weekEndDateInputRef}
                type="date"
                value={weekEnd}
                max={defaultWeeklyReportEndDate()}
                onChange={(e) => {
                  setWeekEnd(e.target.value || defaultWeeklyReportEndDate());
                  setReport(null);
                  viewedKeyRef.current = null;
                }}
                className="min-w-0 flex-1 cursor-text rounded-l-lg border-0 bg-transparent px-2 py-1.5 text-xs text-zinc-100 [color-scheme:dark] focus:outline-none focus:ring-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-90 [&::-webkit-calendar-picker-indicator]:invert"
              />
              <button
                type="button"
                aria-label="Choose week end date"
                title="Open calendar"
                onClick={(e) => {
                  e.preventDefault();
                  openWeekEndDatePicker();
                }}
                className="flex shrink-0 items-center justify-center rounded-r-lg border-l border-zinc-700/90 px-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <Calendar className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void generate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Generate
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg py-2 text-[11px] text-zinc-600 hover:text-zinc-400"
          >
            Hide
          </button>
        </div>
        {error ? <p className="mt-2 text-[11px] text-rose-400">{error}</p> : null}

        {report ? (
          <div className="mt-4 space-y-3 rounded-lg border border-zinc-800/70 bg-zinc-950/35 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-zinc-300">
                  {report.aggregate.weekStart} → {report.aggregate.weekEnd}
                </p>
                <p className="text-[10px] text-zinc-500">{report.sections.subtitle}</p>
              </div>
              {mailSendEnabled ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={emailBusy}
                    onClick={() => void sendWeeklyEmail("first")}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {emailBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Mail className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Send email
                  </button>
                  <button
                    type="button"
                    disabled={emailBusy}
                    onClick={() => void sendWeeklyEmail("resend")}
                    className="rounded-lg border border-zinc-600 px-2 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Again
                  </button>
                </div>
              ) : null}
            </div>

            {mailSendEnabled && insightsEmailOption ? (
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-violet-600/60"
                  checked={includeAiInsightsInEmail}
                  onChange={(e) => setIncludeAiInsightsInEmail(e.target.checked)}
                />
                Include AI insights in email
              </label>
            ) : null}

            {mailSendEnabled ? (
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-500">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-zinc-600"
                  checked={Boolean(settings.weeklyDigestEmail)}
                  disabled={digestSaving}
                  onChange={(e) => void onToggleWeeklyDigest(e.target.checked)}
                />
                Auto-send Mondays (UTC)
              </label>
            ) : null}

            {emailSendInfo ? <p className="text-[11px] text-zinc-500">{emailSendInfo}</p> : null}

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">This week</p>
              <ul className="mt-1.5 list-inside list-disc space-y-1 text-[12px] leading-snug text-zinc-300">
                {compactWeeklyBulletLines(report).map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/15 px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90">Next</p>
              <p className="mt-0.5 text-[12px] font-medium text-emerald-50">{report.sections.nextExperiment.title}</p>
              <p className="mt-1 text-[11px] leading-snug text-emerald-100/85">
                {report.sections.nextExperiment.description}
              </p>
              <button
                type="button"
                onClick={scrollToToday}
                className="mt-2 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
              >
                Log today
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
