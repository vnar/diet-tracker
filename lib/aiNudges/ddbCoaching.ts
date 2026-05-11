import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { buildPersonalizedCoachingPayload } from "@/lib/aiNudges/index";
import type { PersonalizedCoachingApiPayload } from "@/lib/aiNudges/types";
import { getSubscription } from "@/lib/billing/store";
import { isPersonalizedAiCoachingEnabled } from "@/lib/featureFlags";

const ddb = new DynamoDBClient({});

function req(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

/**
 * Server-only: loads last-90d entries + settings + subscription and returns coaching payload.
 * Returns `undefined` when the feature flag is off (no extra Dynamo reads).
 */
export async function getPersonalizedCoachingAttachment(
  userId: string,
): Promise<PersonalizedCoachingApiPayload | undefined> {
  if (!isPersonalizedAiCoachingEnabled(userId)) return undefined;

  const entriesTable = req("ENTRIES_TABLE_NAME");
  const settingsTable = req("SETTINGS_TABLE_NAME");
  const to = new Date().toISOString().slice(0, 10);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 89);
  const from = fromDate.toISOString().slice(0, 10);

  const [entriesOut, settingsOut, subscription] = await Promise.all([
    ddb.send(
      new QueryCommand({
        TableName: entriesTable,
        KeyConditionExpression: "userId = :userId AND #date BETWEEN :fromDate AND :toDate",
        ExpressionAttributeNames: { "#date": "date" },
        ExpressionAttributeValues: {
          ":userId": { S: userId },
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
        Key: { userId: { S: userId } },
        ConsistentRead: true,
      }),
    ),
    getSubscription(userId).catch(() => null),
  ]);

  const entriesRaw = (entriesOut.Items ?? []).map(
    (item: Record<string, { S?: string; N?: string; BOOL?: boolean }>) => ({
      date: item.date?.S ?? "",
      morningWeight: Number(item.morningWeight?.N ?? 0),
      nightWeight: item.nightWeight?.N ? Number(item.nightWeight.N) : undefined,
      calories: item.calories?.N ? Number(item.calories.N) : undefined,
      protein: item.protein?.N ? Number(item.protein.N) : undefined,
      steps: item.steps?.N ? Number(item.steps.N) : undefined,
      sleep: item.sleep?.N ? Number(item.sleep.N) : undefined,
      lateSnack: item.lateSnack?.BOOL ?? false,
      highSodium: item.highSodium?.BOOL ?? false,
      workout: item.workout?.BOOL ?? false,
      alcohol: item.alcohol?.BOOL ?? false,
    }),
  );

  const gItem = settingsOut.Item;
  const goalWeight = gItem ? Number(gItem.goalWeight?.N ?? 72) : 72;
  const startWeight = gItem ? Number(gItem.startWeight?.N ?? 85) : 85;
  const targetDate = gItem?.targetDate?.S ?? to;
  const coachTone =
    gItem?.tone?.S === "clinical" || gItem?.tone?.S === "tough-love" || gItem?.tone?.S === "ayurvedic"
      ? gItem.tone.S
      : "friendly";

  const sorted = [...entriesRaw]
    .filter((e) => e.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const kcals = last7.map((e) => e.calories).filter((c): c is number => typeof c === "number" && c > 0);
  const recentAvgDailyCalories =
    kcals.length >= 2 ? kcals.reduce((a, b) => a + b, 0) / kcals.length : null;

  return buildPersonalizedCoachingPayload({
    entriesRaw,
    goalWeight,
    startWeight,
    targetDate,
    asOfDate: to,
    plan: subscription?.plan,
    subscriptionStatus: subscription?.status,
    recentAvgDailyCalories,
    coachTone,
  });
}
