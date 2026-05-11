export {
  buildWeeklyAggregate,
  type WeeklyAggregateInput,
  type WeeklyMealAggRow,
} from "@/lib/weeklyReport/aggregate";
export { defaultWeeklyReportEndDate, isDateInInclusiveRange, weekWindowInclusive } from "@/lib/weeklyReport/dateRange";
export { buildWeeklyReportFromRules } from "@/lib/weeklyReport/ruleEngine";
export { buildWeeklyReportEmailHtml, buildWeeklyReportEmailPlainText } from "@/lib/weeklyReport/emailFormat";
export { attachInsightsForEmail, insightsToEmailSnapshot } from "@/lib/weeklyReport/insightsForEmail";
export type {
  WeeklyDayRollup,
  WeeklyExperimentKind,
  WeeklyNextExperiment,
  WeeklyReportAggregate,
  WeeklyReportDocument,
  WeeklyReportEmailInsight,
  WeeklyReportGenerationSource,
  WeeklyReportSections,
} from "@/lib/weeklyReport/types";
