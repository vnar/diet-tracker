"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ClipboardCopy, Loader2, Mail, RotateCcw, Sparkles } from "lucide-react";
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
  const emailOpenRef = useRef(false);

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
      setError("Sign in again to generate a report.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isAwsBackendEnabled()) {
        const sync = await refreshEntries();
        if (!sync.ok) {
          setError(sync.error ?? "Could not refresh entries from the server.");
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
      emailOpenRef.current = false;
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
        setError(r.error ?? "Could not update weekly email preference.");
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

  const copyHtml = useCallback(() => {
    if (!report) return;
    void navigator.clipboard.writeText(buildWeeklyReportEmailHtml(report));
  }, [report]);

  const copyText = useCallback(() => {
    if (!report) return;
    void navigator.clipboard.writeText(buildWeeklyReportEmailPlainText(report));
  }, [report]);

  const sendWeeklyEmail = useCallback(
    async (reason: "first" | "resend") => {
      if (!report || !user?.id) return;
      const token = getAccessToken();
      if (!token) {
        setEmailSendInfo("Session expired. Sign in again.");
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

      const htmlBody = buildWeeklyReportEmailHtml(docForEmail);
      const textBody = buildWeeklyReportEmailPlainText(docForEmail);
      const baseSubject = `Ojas weekly report (${report.aggregate.weekStart}–${report.aggregate.weekEnd})`;
      const subject = reason === "resend" ? `${baseSubject} · another copy` : baseSubject;
      const r = await postV2WeeklyReportSendEmail({ htmlBody, textBody, subject }, token);
      setEmailBusy(false);
      if (r.ok) {
        const domain = r.data.to.includes("@") ? r.data.to.split("@")[1] ?? "" : "";
        const hadAi = Boolean(docForEmail.aiInsightsForEmail?.length);
        track("weekly_report_email_sent", {
          week_start: report.aggregate.weekStart,
          recipient_domain: domain,
          resend: reason === "resend",
          include_ai_insights: hadAi,
        });
        let info = `Sent to ${r.data.to}`;
        if (includeAiInsightsInEmail && insightsEmailOption && !hadAi) {
          info += " · AI insights were unavailable; sent your weekly card only.";
        }
        setEmailSendInfo(info);
      } else {
        track("weekly_report_email_failed", { week_start: report.aggregate.weekStart, error: r.error });
        setEmailSendInfo(r.error);
      }
    },
    [report, user?.id, getAccessToken, includeAiInsightsInEmail, insightsEmailOption],
  );

  const onEmailPreviewToggle = useCallback(
    (open: boolean) => {
      if (open && !emailOpenRef.current && report) {
        emailOpenRef.current = true;
        track("weekly_report_email_opened", {
          week_start: report.aggregate.weekStart,
          week_end: report.aggregate.weekEnd,
          surface: "in_app_preview",
        });
      }
    },
    [report],
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
      className="group rounded-xl border border-zinc-800/90 bg-zinc-950/25 open:border-zinc-700/90"
      onToggle={(e) => {
        const el = e.target as HTMLDetailsElement;
        if (el.open) onOpenDetails();
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-400" aria-hidden />
          Weekly report card
        </span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-zinc-800/80 px-3 pb-3 pt-2 text-sm text-zinc-200">
        <p className="text-[11px] leading-snug text-zinc-400">
          Seven-day coach-style recap from your logs. Rule-based today—thoughtful, not clinical.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block min-w-[10rem]">
            <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Week ends (local)
            </span>
            <input
              type="date"
              value={weekEnd}
              max={defaultWeeklyReportEndDate()}
              onChange={(e) => {
                setWeekEnd(e.target.value || defaultWeeklyReportEndDate());
                setReport(null);
                viewedKeyRef.current = null;
                emailOpenRef.current = false;
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
            />
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
            className="rounded-lg px-2 py-2 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            Dismiss for session
          </button>
        </div>
        {error ? <p className="mt-2 text-[11px] text-rose-400">{error}</p> : null}

        {report ? (
          <div className="mt-4 space-y-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
            <header>
              <h3 className="text-base font-semibold text-zinc-50">{report.sections.title}</h3>
              <p className="text-[11px] text-zinc-500">{report.sections.subtitle}</p>
              {mailSendEnabled ? (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={emailBusy}
                      onClick={() => void sendWeeklyEmail("first")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-900/50 disabled:opacity-50"
                    >
                      {emailBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Mail className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Email to my inbox
                    </button>
                    <button
                      type="button"
                      disabled={emailBusy}
                      onClick={() => void sendWeeklyEmail("resend")}
                      title="Send the same week again — great after tweaking logs or to hit inbox"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-600/50 bg-violet-950/30 px-3 py-1.5 text-[11px] font-semibold text-violet-100 hover:bg-violet-900/35 disabled:opacity-50"
                    >
                      {emailBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Send again
                    </button>
                  </div>
                  {insightsEmailOption ? (
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-800/80 bg-gradient-to-br from-violet-950/25 to-zinc-950/40 p-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-violet-600/60"
                        checked={includeAiInsightsInEmail}
                        onChange={(e) => setIncludeAiInsightsInEmail(e.target.checked)}
                      />
                      <span className="text-[11px] leading-snug text-zinc-300">
                        <span className="font-semibold text-violet-200">Include AI insights</span> — adds your live
                        dashboard insight cards (rule + optional LLM refine) above the weekly recap in the email.
                      </span>
                    </label>
                  ) : null}
                  {emailSendInfo ? (
                    <p className="text-[11px] leading-snug text-zinc-400">{emailSendInfo}</p>
                  ) : null}
                  <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/30 p-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-600"
                      checked={Boolean(settings.weeklyDigestEmail)}
                      disabled={digestSaving}
                      onChange={(e) => void onToggleWeeklyDigest(e.target.checked)}
                    />
                    <span className="text-[11px] leading-snug text-zinc-400">
                      Also send this automatically each Monday (UTC) for the prior week when the scheduled digest is
                      enabled in your environment. Uses the same rule-based report as above.
                    </span>
                  </label>
                </div>
              ) : null}
            </header>
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">What changed</h4>
              <ul className="mt-1 list-inside list-disc space-y-1 text-[13px] leading-snug text-zinc-300">
                {report.sections.whatChanged.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">What helped</h4>
              <ul className="mt-1 list-inside list-disc space-y-1 text-[13px] leading-snug text-zinc-300">
                {report.sections.whatHelped.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                What may have made things harder
              </h4>
              <ul className="mt-1 list-inside list-disc space-y-1 text-[13px] leading-snug text-zinc-300">
                {report.sections.whatHarder.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-300/90">
                One experiment for next week
              </h4>
              <p className="mt-1 text-sm font-semibold text-emerald-50">{report.sections.nextExperiment.title}</p>
              <p className="mt-1 text-[13px] leading-snug text-emerald-100/90">
                {report.sections.nextExperiment.description}
              </p>
              <button
                type="button"
                onClick={scrollToToday}
                className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                Log today’s check-in
              </button>
            </section>
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Disclaimers</h4>
              {report.sections.disclaimers.map((d, i) => (
                <p key={i} className="mt-1 text-[11px] leading-snug text-zinc-500">
                  {d}
                </p>
              ))}
            </section>
            <details
              className="rounded-lg border border-zinc-800 bg-zinc-900/50"
              onToggle={(e) => onEmailPreviewToggle((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer px-2 py-2 text-[11px] font-medium text-zinc-300">
                Email-ready export
              </summary>
              <div className="space-y-2 border-t border-zinc-800 px-2 py-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyHtml}
                    className="inline-flex items-center gap-1 rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800"
                  >
                    <ClipboardCopy className="h-3 w-3" aria-hidden />
                    Copy HTML
                  </button>
                  <button
                    type="button"
                    onClick={copyText}
                    className="inline-flex items-center gap-1 rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800"
                  >
                    <ClipboardCopy className="h-3 w-3" aria-hidden />
                    Copy plain text
                  </button>
                </div>
                <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px] text-zinc-400 whitespace-pre-wrap">
                  {buildWeeklyReportEmailPlainText(report)}
                </pre>
              </div>
            </details>
          </div>
        ) : null}
      </div>
    </details>
  );
}
