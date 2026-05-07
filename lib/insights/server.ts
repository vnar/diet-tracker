import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { generateInsights } from "@/lib/insights/index";
import type { Insight, InsightLog, InsightTone, UserPrefs } from "@/lib/insights/types";
import type { PlateauUserSettings } from "@/lib/types";

const ddb = new DynamoDBClient({});

function plateauSettingsFromDdb(
  item: Record<string, { S?: string; N?: string }> | undefined,
): PlateauUserSettings | undefined {
  if (!item) return undefined;
  const out: PlateauUserSettings = {};
  const rw = item.plateauRollingWindowDays?.N;
  const span = item.plateauComparisonSpanDays?.N;
  const mv = item.plateauMaxMovementKg?.N;
  if (rw != null) {
    const n = Number(rw);
    if (Number.isFinite(n)) out.rollingWindowDays = n;
  }
  if (span != null) {
    const n = Number(span);
    if (Number.isFinite(n)) out.comparisonSpanDays = n;
  }
  if (mv != null) {
    const n = Number(mv);
    if (Number.isFinite(n)) out.maxAvgMovementKg = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function req(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export async function getInsightsForUser(input: {
  userId: string;
  firstName?: string;
}): Promise<Insight[]> {
  const entriesTable = req("ENTRIES_TABLE_NAME");
  const settingsTable = req("SETTINGS_TABLE_NAME");
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 89);
  const from = fromDate.toISOString().slice(0, 10);

  const [entriesOut, settingsOut] = await Promise.all([
    ddb.send(
      new QueryCommand({
        TableName: entriesTable,
        KeyConditionExpression: "userId = :userId AND #date BETWEEN :fromDate AND :toDate",
        ExpressionAttributeNames: { "#date": "date" },
        ExpressionAttributeValues: {
          ":userId": { S: input.userId },
          ":fromDate": { S: from },
          ":toDate": { S: to },
        },
        ScanIndexForward: true,
        ConsistentRead: true,
      }),
    ),
    ddb.send(
      new GetItemCommand({
        TableName: settingsTable,
        Key: { userId: { S: input.userId } },
        ConsistentRead: true,
      }),
    ),
  ]);

  const logs: InsightLog[] = (entriesOut.Items ?? []).map((item) => ({
    id: item.id?.S ?? `${input.userId}:${item.date?.S ?? ""}`,
    date: item.date?.S ?? "",
    morningWeight: Number(item.morningWeight?.N ?? 0),
    lateSnack: item.lateSnack?.BOOL ?? false,
    highSodium: item.highSodium?.BOOL ?? false,
    workout: item.workout?.BOOL ?? false,
    alcohol: item.alcohol?.BOOL ?? false,
    notes: item.notes?.S ?? undefined,
  }));

  const plateauPrefs = plateauSettingsFromDdb(settingsOut.Item);
  const prefs: UserPrefs = {
    userId: input.userId,
    firstName: input.firstName,
    tone: (settingsOut.Item?.tone?.S as InsightTone | undefined) ?? "friendly",
    recentNotes: logs
      .map((log) => (typeof log.notes === "string" ? log.notes : undefined))
      .filter((note): note is string => Boolean(note))
      .slice(-5),
    plateau: plateauPrefs,
  };
  const settingsGoal = settingsOut.Item?.goalWeight?.N;
  const settingsStart = settingsOut.Item?.startWeight?.N;
  const settingsTarget = settingsOut.Item?.targetDate?.S;
  const enrichedLogs = logs.map((log) => ({
    ...log,
    goalWeight: settingsGoal ? Number(settingsGoal) : undefined,
    startWeight: settingsStart ? Number(settingsStart) : undefined,
    targetDate: settingsTarget,
  }));
  return generateInsights(enrichedLogs, prefs);
}

export async function storeInsightFeedback(input: {
  userId: string;
  insightId: string;
  vote: "up" | "down";
  comment?: string;
  feedbackType?: "negative";
}) {
  const table = req("INSIGHT_FEEDBACK_TABLE_NAME");
  const ts = new Date().toISOString();
  await ddb.send(
    new PutItemCommand({
      TableName: table,
      Item: {
        userId: { S: input.userId },
        insightTs: { S: `${ts}#${input.insightId}` },
        insightId: { S: input.insightId },
        vote: { S: input.vote },
        ts: { S: ts },
        ...(input.comment ? { comment: { S: input.comment } } : {}),
        ...(input.feedbackType ? { feedbackType: { S: input.feedbackType } } : {}),
      },
    }),
  );
}
