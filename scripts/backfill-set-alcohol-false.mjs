#!/usr/bin/env node
/**
 * One-off DynamoDB fix: set alcohol = false for a user's entries from a start date onward.
 * Use when historical rows incorrectly had alcohol=true (insights/UI treat true as "had alcohol").
 *
 * Usage (AWS creds + region must allow UpdateItem on Entries table):
 *   ENTRIES_TABLE_NAME=YourStack-entries TARGET_USER_ID=<cognito-sub> FROM_DATE=2026-01-01 node scripts/backfill-set-alcohol-false.mjs
 *
 * Dry run (no writes):
 *   DRY_RUN=1 ENTRIES_TABLE_NAME=... TARGET_USER_ID=... FROM_DATE=2026-01-01 node scripts/backfill-set-alcohol-false.mjs
 *
 * Resolve TARGET_USER_ID: Cognito console → user → sub, or decode JWT `sub`.
 */

import { DynamoDBClient, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const table = process.env.ENTRIES_TABLE_NAME;
const userId = process.env.TARGET_USER_ID;
const fromDate = process.env.FROM_DATE ?? "2026-01-01";
const dry = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

if (!table || !userId) {
  console.error("Missing ENTRIES_TABLE_NAME or TARGET_USER_ID");
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
  console.error("FROM_DATE must be YYYY-MM-DD");
  process.exit(1);
}

const ddb = new DynamoDBClient({ region });

let updated = 0;
let scanned = 0;
let lastKey;

do {
  const out = await ddb.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "userId = :u AND #d >= :from",
      ExpressionAttributeNames: { "#d": "date" },
      ExpressionAttributeValues: {
        ":u": { S: userId },
        ":from": { S: fromDate },
      },
      ExclusiveStartKey: lastKey,
      ProjectionExpression: "#d, alcohol",
    }),
  );

  for (const item of out.Items ?? []) {
    scanned += 1;
    const date = item.date?.S;
    const alc = item.alcohol?.BOOL;
    if (!date) continue;
    if (alc !== true) continue;

    if (dry) {
      console.log(`[dry-run] would clear alcohol for ${date}`);
      updated += 1;
      continue;
    }

    await ddb.send(
      new UpdateItemCommand({
        TableName: table,
        Key: { userId: { S: userId }, date: { S: date } },
        UpdateExpression: "SET alcohol = :f",
        ExpressionAttributeValues: { ":f": { BOOL: false } },
      }),
    );
    updated += 1;
    console.log(`updated ${date}`);
  }

  lastKey = out.LastEvaluatedKey;
} while (lastKey);

console.log(
  dry ? `[dry-run] rows that would change: ${updated} (scanned with alcohol attr: ${scanned})` : `done. updated ${updated} rows (queried ${scanned} items in page loop)`,
);
