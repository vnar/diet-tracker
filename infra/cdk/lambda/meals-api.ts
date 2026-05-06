import type { AttributeValue, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";
import { trigramSimilarity } from "../../../lib/meals/fuzzyMatch";
import { nameLookupKey } from "../../../lib/meals/nameLookup";
import { isMealType, type MealType } from "../../../lib/meals/mealTypes";

export type HttpEvent = {
  body?: string | null;
  queryStringParameters?: Record<string, string | undefined> | null;
};

export type HttpResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

function json(statusCode: number, payload: unknown): HttpResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function parseJsonBody(event: HttpEvent): unknown {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

function isMealLibraryEnabledLambda(): boolean {
  return process.env.FF_MEAL_LIBRARY === "true";
}

function isDateString(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function mealSk(uuid: string): string {
  return `MEAL#${uuid}`;
}

function entrySk(uuid: string): string {
  return `ENTRY#${uuid}`;
}

function stripMealPrefix(sk: string): string {
  return sk.startsWith("MEAL#") ? sk.slice(5) : sk;
}

function numAttr(n: number): AttributeValue {
  return { N: String(n) };
}

function strAttr(s: string): AttributeValue {
  return { S: s };
}

type MealRow = {
  id: string;
  userId: string;
  name: string;
  mealType: MealType;
  photoKey?: string;
  estKcal: number;
  estProteinG: number;
  estCarbsG?: number;
  estFatG?: number;
  source: "photo" | "manual" | "imported";
  timesLogged: number;
  lastLoggedAt?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

function mealFromAttrs(it: Record<string, AttributeValue>): MealRow | null {
  const userId = it.userId?.S;
  const mealId = it.mealId?.S;
  const name = it.name?.S;
  const mealType = it.mealType?.S;
  const estKcal = it.estKcal?.N != null ? Number(it.estKcal.N) : NaN;
  const estProteinG = it.estProteinG?.N != null ? Number(it.estProteinG.N) : NaN;
  const source = it.source?.S;
  const timesLogged = it.timesLogged?.N != null ? Number(it.timesLogged.N) : NaN;
  const createdAt = it.createdAt?.S;
  const updatedAt = it.updatedAt?.S;
  if (!userId || !mealId || !name || !mealType || !isMealType(mealType)) return null;
  if (!Number.isFinite(estKcal) || !Number.isFinite(estProteinG) || !Number.isFinite(timesLogged))
    return null;
  if (!createdAt || !updatedAt) return null;
  if (source !== "photo" && source !== "manual" && source !== "imported") return null;
  const row: MealRow = {
    id: stripMealPrefix(mealId),
    userId,
    name,
    mealType,
    estKcal: Math.round(estKcal),
    estProteinG: Math.round(estProteinG * 10) / 10,
    source,
    timesLogged: Math.round(timesLogged),
    createdAt,
    updatedAt,
  };
  if (it.photoKey?.S) row.photoKey = it.photoKey.S;
  if (it.estCarbsG?.N != null && Number.isFinite(Number(it.estCarbsG.N)))
    row.estCarbsG = Math.round(Number(it.estCarbsG.N) * 10) / 10;
  if (it.estFatG?.N != null && Number.isFinite(Number(it.estFatG.N)))
    row.estFatG = Math.round(Number(it.estFatG.N) * 10) / 10;
  if (it.lastLoggedAt?.S) row.lastLoggedAt = it.lastLoggedAt.S;
  if (it.deletedAt?.S) row.deletedAt = it.deletedAt.S;
  return row;
}

type DayMealRow = {
  id: string;
  day: string;
  mealId?: string;
  nameSnapshot: string;
  mealType: MealType;
  photoKey?: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  loggedAt: string;
  notes?: string;
  deletedAt?: string;
};

function dayEntryFromAttrs(it: Record<string, AttributeValue>, day: string): DayMealRow | null {
  const entryId = it.entryId?.S;
  const nameSnapshot = it.nameSnapshot?.S;
  const mealType = it.mealType?.S;
  const loggedAt = it.loggedAt?.S;
  if (!entryId || !nameSnapshot || !mealType || !isMealType(mealType) || !loggedAt) return null;
  const kcal = it.kcal?.N != null ? Math.round(Number(it.kcal.N)) : null;
  const proteinG = it.proteinG?.N != null ? Math.round(Number(it.proteinG.N) * 10) / 10 : null;
  const row: DayMealRow = {
    id: entryId.replace(/^ENTRY#/, ""),
    day,
    nameSnapshot,
    mealType,
    kcal: Number.isFinite(kcal as number) ? kcal : null,
    proteinG: proteinG != null && Number.isFinite(proteinG) ? proteinG : null,
    loggedAt,
  };
  if (it.libraryMealId?.S) row.mealId = stripMealPrefix(it.libraryMealId.S);
  if (it.photoKey?.S) row.photoKey = it.photoKey.S;
  if (it.carbsG?.N != null && Number.isFinite(Number(it.carbsG.N)))
    row.carbsG = Math.round(Number(it.carbsG.N) * 10) / 10;
  if (it.fatG?.N != null && Number.isFinite(Number(it.fatG.N)))
    row.fatG = Math.round(Number(it.fatG.N) * 10) / 10;
  if (it.notes?.S) row.notes = it.notes.S;
  if (it.deletedAt?.S) row.deletedAt = it.deletedAt.S;
  return row;
}

async function queryAllMealsForUser(
  ddb: DynamoDBClient,
  table: string,
  userId: string,
): Promise<MealRow[]> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "userId = :u AND begins_with(mealId, :p)",
      ExpressionAttributeValues: {
        ":u": { S: userId },
        ":p": { S: "MEAL#" },
      },
    }),
  );
  const rows: MealRow[] = [];
  for (const it of out.Items ?? []) {
    const m = mealFromAttrs(it as Record<string, AttributeValue>);
    if (m && !m.deletedAt) rows.push(m);
  }
  return rows;
}

export async function handleV2MealsSuggestMatch(
  userId: string,
  event: HttpEvent,
  deps: { ddb: DynamoDBClient; mealsTableName: string },
): Promise<HttpResult> {
  if (!isMealLibraryEnabledLambda()) {
    return json(403, { error: "Meal library is disabled." });
  }
  const q = event.queryStringParameters?.query?.trim() ?? "";
  if (!q) return json(400, { error: "Missing query parameter: query" });
  const meals = await queryAllMealsForUser(deps.ddb, deps.mealsTableName, userId);
  let best: { meal: MealRow; score: number } | null = null;
  for (const m of meals) {
    const score = trigramSimilarity(q, m.name);
    if (score >= 0.6 && (!best || score > best.score)) best = { meal: m, score };
  }
  return json(200, { match: best?.meal ?? null, similarity: best?.score ?? 0 });
}

export async function handleV2MealsList(
  userId: string,
  event: HttpEvent,
  deps: { ddb: DynamoDBClient; mealsTableName: string },
): Promise<HttpResult> {
  if (!isMealLibraryEnabledLambda()) {
    return json(403, { error: "Meal library is disabled." });
  }
  const typeFilter = event.queryStringParameters?.type?.trim();
  const q = event.queryStringParameters?.q?.trim().toLowerCase() ?? "";
  const sort = event.queryStringParameters?.sort?.trim() ?? "recent";
  const limitRaw = event.queryStringParameters?.limit;
  const limit = Math.min(100, Math.max(1, Number(limitRaw) || 50));

  let meals = await queryAllMealsForUser(deps.ddb, deps.mealsTableName, userId);
  if (typeFilter && isMealType(typeFilter)) {
    meals = meals.filter((m) => m.mealType === typeFilter);
  }
  if (q) {
    meals = meals.filter((m) => m.name.toLowerCase().includes(q));
  }
  if (sort === "frequent") {
    meals.sort((a, b) => b.timesLogged - a.timesLogged || (b.lastLoggedAt ?? "").localeCompare(a.lastLoggedAt ?? ""));
  } else if (sort === "alpha") {
    meals.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    meals.sort((a, b) => (b.lastLoggedAt ?? b.createdAt).localeCompare(a.lastLoggedAt ?? a.createdAt));
  }
  const slice = meals.slice(0, limit);
  return json(200, { items: slice, nextToken: undefined });
}

export async function handleV2MealsCreate(
  userId: string,
  event: HttpEvent,
  deps: { ddb: DynamoDBClient; mealsTableName: string },
): Promise<HttpResult> {
  if (!isMealLibraryEnabledLambda()) {
    return json(403, { error: "Meal library is disabled." });
  }
  const raw = parseJsonBody(event);
  if (raw === null) return json(400, { error: "Invalid JSON" });
  const body = raw as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const mealType = typeof body.meal_type === "string" ? body.meal_type.trim() : "";
  const kcal = typeof body.kcal === "number" ? body.kcal : Number(body.kcal);
  const proteinG = typeof body.protein_g === "number" ? body.protein_g : Number(body.protein_g);
  const sourceRaw = typeof body.source === "string" ? body.source.trim() : "manual";
  if (!name || !isMealType(mealType) || !Number.isFinite(kcal) || !Number.isFinite(proteinG)) {
    return json(400, { error: "Expected name, meal_type, kcal, protein_g." });
  }
  const source =
    sourceRaw === "photo" || sourceRaw === "manual" || sourceRaw === "imported" ? sourceRaw : "manual";
  const nlKey = nameLookupKey(userId, name);
  const existing = await deps.ddb.send(
    new QueryCommand({
      TableName: deps.mealsTableName,
      IndexName: "NameLookupKeyIndex",
      KeyConditionExpression: "nameLookupKey = :k",
      ExpressionAttributeValues: { ":k": { S: nlKey } },
      Limit: 5,
    }),
  );
  for (const it of existing.Items ?? []) {
    const m = mealFromAttrs(it as Record<string, AttributeValue>);
    if (m && !m.deletedAt) return json(200, { meal: m, created: false });
  }

  const id = randomUUID();
  const sk = mealSk(id);
  const now = new Date().toISOString();
  const photoKey = typeof body.photo_key === "string" ? body.photo_key.trim() : "";
  const carbsG =
    body.carbs_g !== undefined ? (typeof body.carbs_g === "number" ? body.carbs_g : Number(body.carbs_g)) : undefined;
  const fatG =
    body.fat_g !== undefined ? (typeof body.fat_g === "number" ? body.fat_g : Number(body.fat_g)) : undefined;

  const item: Record<string, AttributeValue> = {
    userId: { S: userId },
    mealId: { S: sk },
    nameLookupKey: { S: nlKey },
    name: { S: name },
    mealType: { S: mealType },
    estKcal: numAttr(Math.round(kcal)),
    estProteinG: numAttr(Math.round(proteinG * 10) / 10),
    source: { S: source },
    timesLogged: { N: "0" },
    createdAt: { S: now },
    updatedAt: { S: now },
  };
  if (photoKey) item.photoKey = { S: photoKey };
  if (carbsG !== undefined && Number.isFinite(carbsG)) item.estCarbsG = numAttr(Math.round(carbsG * 10) / 10);
  if (fatG !== undefined && Number.isFinite(fatG)) item.estFatG = numAttr(Math.round(fatG * 10) / 10);

  await deps.ddb.send(new PutItemCommand({ TableName: deps.mealsTableName, Item: item }));
  const m = mealFromAttrs(item as Record<string, AttributeValue>);
  return json(201, { meal: m, created: true });
}

export async function handleV2MealsPatch(
  userId: string,
  mealIdParam: string,
  event: HttpEvent,
  deps: { ddb: DynamoDBClient; mealsTableName: string },
): Promise<HttpResult> {
  if (!isMealLibraryEnabledLambda()) {
    return json(403, { error: "Meal library is disabled." });
  }
  const sk = mealSk(mealIdParam);
  const got = await deps.ddb.send(
    new GetItemCommand({
      TableName: deps.mealsTableName,
      Key: { userId: { S: userId }, mealId: { S: sk } },
      ConsistentRead: true,
    }),
  );
  if (!got.Item) return json(404, { error: "Meal not found." });
  const cur = mealFromAttrs(got.Item as Record<string, AttributeValue>);
  if (!cur || cur.deletedAt) return json(404, { error: "Meal not found." });

  const raw = parseJsonBody(event);
  if (raw === null) return json(400, { error: "Invalid JSON" });
  const body = raw as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const mealType = typeof body.meal_type === "string" ? body.meal_type.trim() : undefined;
  if (mealType !== undefined && !isMealType(mealType)) {
    return json(400, { error: "Invalid meal_type." });
  }
  const now = new Date().toISOString();
  const exprNames: Record<string, string> = {};
  const values: Record<string, AttributeValue> = { ":u": { S: now } };
  let expr = "SET updatedAt = :u";
  if (name !== undefined) {
    expr += ", #n = :name, nameLookupKey = :nlk";
    exprNames["#n"] = "name";
    values[":name"] = { S: name };
    values[":nlk"] = { S: nameLookupKey(userId, name) };
  }
  if (mealType !== undefined) {
    expr += ", mealType = :mt";
    values[":mt"] = { S: mealType };
  }
  if (body.est_kcal !== undefined) {
    const k = typeof body.est_kcal === "number" ? body.est_kcal : Number(body.est_kcal);
    if (Number.isFinite(k)) {
      expr += ", estKcal = :kc";
      values[":kc"] = numAttr(Math.round(k));
    }
  }
  if (body.est_protein_g !== undefined) {
    const p = typeof body.est_protein_g === "number" ? body.est_protein_g : Number(body.est_protein_g);
    if (Number.isFinite(p)) {
      expr += ", estProteinG = :pg";
      values[":pg"] = numAttr(Math.round(p * 10) / 10);
    }
  }
  await deps.ddb.send(
    new UpdateItemCommand({
      TableName: deps.mealsTableName,
      Key: { userId: { S: userId }, mealId: { S: sk } },
      UpdateExpression: expr,
      ExpressionAttributeValues: values,
      ...(Object.keys(exprNames).length ? { ExpressionAttributeNames: exprNames } : {}),
    }),
  );
  const again = await deps.ddb.send(
    new GetItemCommand({
      TableName: deps.mealsTableName,
      Key: { userId: { S: userId }, mealId: { S: sk } },
      ConsistentRead: true,
    }),
  );
  const m = mealFromAttrs((again.Item ?? {}) as Record<string, AttributeValue>);
  return json(200, { meal: m });
}

export async function handleV2MealsDelete(
  userId: string,
  mealIdParam: string,
  deps: { ddb: DynamoDBClient; mealsTableName: string },
): Promise<HttpResult> {
  if (!isMealLibraryEnabledLambda()) {
    return json(403, { error: "Meal library is disabled." });
  }
  const sk = mealSk(mealIdParam);
  const now = new Date().toISOString();
  await deps.ddb.send(
    new UpdateItemCommand({
      TableName: deps.mealsTableName,
      Key: { userId: { S: userId }, mealId: { S: sk } },
      UpdateExpression: "SET deletedAt = :d, updatedAt = :d",
      ExpressionAttributeValues: { ":d": { S: now } },
    }),
  );
  return json(200, { ok: true });
}

export async function handleV2MealsHistory(
  userId: string,
  mealIdParam: string,
  deps: { ddb: DynamoDBClient; dayMealsTableName: string },
): Promise<HttpResult> {
  if (!isMealLibraryEnabledLambda()) {
    return json(403, { error: "Meal library is disabled." });
  }
  const libSk = mealSk(mealIdParam);
  const out = await deps.ddb.send(
    new QueryCommand({
      TableName: deps.dayMealsTableName,
      IndexName: "MealHistoryIndex",
      KeyConditionExpression: "libraryMealId = :m",
      ExpressionAttributeValues: { ":m": { S: libSk } },
    }),
  );
  const rows: Array<{
    day: string;
    nameSnapshot: string;
    kcal: number | null;
    proteinG: number | null;
    loggedAt: string;
    notes?: string;
  }> = [];
  for (const it of out.Items ?? []) {
    const day = it.day?.S;
    if (!day) continue;
    const e = dayEntryFromAttrs(it as Record<string, AttributeValue>, day);
    if (!e || e.deletedAt) continue;
    rows.push({
      day: e.day,
      nameSnapshot: e.nameSnapshot,
      kcal: e.kcal,
      proteinG: e.proteinG,
      loggedAt: e.loggedAt,
      notes: e.notes,
    });
  }
  rows.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  return json(200, { items: rows });
}

export async function handleV2DayMealEntriesList(
  userId: string,
  day: string,
  deps: { ddb: DynamoDBClient; dayMealsTableName: string },
): Promise<HttpResult> {
  if (!isMealLibraryEnabledLambda()) {
    return json(403, { error: "Meal library is disabled." });
  }
  if (!isDateString(day)) return json(400, { error: "Invalid day." });
  const dayKey = `${userId}#${day}`;
  const out = await deps.ddb.send(
    new QueryCommand({
      TableName: deps.dayMealsTableName,
      KeyConditionExpression: "dayKey = :d",
      ExpressionAttributeValues: { ":d": { S: dayKey } },
    }),
  );
  const items: DayMealRow[] = [];
  for (const it of out.Items ?? []) {
    const e = dayEntryFromAttrs(it as Record<string, AttributeValue>, day);
    if (e && !e.deletedAt) items.push(e);
  }
  items.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  return json(200, { items });
}

export async function handleV2DayMealEntriesCreate(
  userId: string,
  day: string,
  event: HttpEvent,
  deps: { ddb: DynamoDBClient; dayMealsTableName: string; mealsTableName: string },
): Promise<HttpResult> {
  if (!isMealLibraryEnabledLambda()) {
    return json(403, { error: "Meal library is disabled." });
  }
  if (!isDateString(day)) return json(400, { error: "Invalid day." });
  const raw = parseJsonBody(event);
  if (raw === null) return json(400, { error: "Invalid JSON" });
  const body = raw as Record<string, unknown>;
  const mealIdBody = typeof body.meal_id === "string" ? body.meal_id.trim() : "";

  const dayKey = `${userId}#${day}`;
  const entryUuid = randomUUID();
  const eSk = entrySk(entryUuid);
  const loggedAt = new Date().toISOString();

  if (mealIdBody) {
    const mSk = mealSk(mealIdBody);
    const got = await deps.ddb.send(
      new GetItemCommand({
        TableName: deps.mealsTableName,
        Key: { userId: { S: userId }, mealId: { S: mSk } },
        ConsistentRead: true,
      }),
    );
    const meal = mealFromAttrs((got.Item ?? {}) as Record<string, AttributeValue>);
    if (!meal || meal.deletedAt) return json(404, { error: "Meal not found." });

    const item: Record<string, AttributeValue> = {
      dayKey: { S: dayKey },
      entryId: { S: eSk },
      userId: { S: userId },
      day: { S: day },
      nameSnapshot: { S: meal.name },
      mealType: { S: meal.mealType },
      kcal: numAttr(meal.estKcal),
      proteinG: numAttr(meal.estProteinG),
      loggedAt: { S: loggedAt },
      libraryMealId: { S: mSk },
      mealHistorySk: { S: `${loggedAt}#${eSk}` },
    };
    if (meal.photoKey) item.photoKey = { S: meal.photoKey };
    if (meal.estCarbsG != null) item.carbsG = numAttr(meal.estCarbsG);
    if (meal.estFatG != null) item.fatG = numAttr(meal.estFatG);

    await deps.ddb.send(new PutItemCommand({ TableName: deps.dayMealsTableName, Item: item }));
    await deps.ddb.send(
      new UpdateItemCommand({
        TableName: deps.mealsTableName,
        Key: { userId: { S: userId }, mealId: { S: mSk } },
        UpdateExpression:
          "ADD timesLogged :one SET lastLoggedAt = :ts, updatedAt = :ts",
        ExpressionAttributeValues: {
          ":one": { N: "1" },
          ":ts": { S: loggedAt },
        },
      }),
    );
    const row = dayEntryFromAttrs(item as Record<string, AttributeValue>, day);
    return json(201, { entry: row });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const mealType = typeof body.meal_type === "string" ? body.meal_type.trim() : "";
  const kcal = typeof body.kcal === "number" ? body.kcal : Number(body.kcal);
  const proteinG = typeof body.protein_g === "number" ? body.protein_g : Number(body.protein_g);
  if (!name || !isMealType(mealType) || !Number.isFinite(kcal) || !Number.isFinite(proteinG)) {
    return json(400, { error: "Expected meal_id or (name, meal_type, kcal, protein_g)." });
  }
  const photoKey = typeof body.photo_key === "string" ? body.photo_key.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const item: Record<string, AttributeValue> = {
    dayKey: { S: dayKey },
    entryId: { S: eSk },
    userId: { S: userId },
    day: { S: day },
    nameSnapshot: { S: name },
    mealType: { S: mealType },
    kcal: numAttr(Math.round(kcal)),
    proteinG: numAttr(Math.round(proteinG * 10) / 10),
    loggedAt: { S: loggedAt },
  };
  if (photoKey) item.photoKey = { S: photoKey };
  if (notes) item.notes = { S: notes.slice(0, 2000) };
  const cg = body.carbs_g !== undefined ? Number(body.carbs_g) : NaN;
  const fg = body.fat_g !== undefined ? Number(body.fat_g) : NaN;
  if (Number.isFinite(cg)) item.carbsG = numAttr(Math.round(cg * 10) / 10);
  if (Number.isFinite(fg)) item.fatG = numAttr(Math.round(fg * 10) / 10);

  await deps.ddb.send(new PutItemCommand({ TableName: deps.dayMealsTableName, Item: item }));
  const row = dayEntryFromAttrs(item as Record<string, AttributeValue>, day);
  return json(201, { entry: row });
}

export async function handleV2DayMealEntryDelete(
  userId: string,
  day: string,
  entryIdParam: string,
  deps: { ddb: DynamoDBClient; dayMealsTableName: string },
): Promise<HttpResult> {
  if (!isMealLibraryEnabledLambda()) {
    return json(403, { error: "Meal library is disabled." });
  }
  if (!isDateString(day)) return json(400, { error: "Invalid day." });
  const dayKey = `${userId}#${day}`;
  const eSk = entryIdParam.startsWith("ENTRY#") ? entryIdParam : entrySk(entryIdParam);
  const now = new Date().toISOString();
  await deps.ddb.send(
    new UpdateItemCommand({
      TableName: deps.dayMealsTableName,
      Key: { dayKey: { S: dayKey }, entryId: { S: eSk } },
      UpdateExpression: "SET deletedAt = :d",
      ExpressionAttributeValues: { ":d": { S: now } },
    }),
  );
  return json(200, { ok: true });
}

export async function handleV2FoodMealComplete(
  userId: string,
  event: HttpEvent,
  deps: {
    ddb: DynamoDBClient;
    foodLogTableName: string;
    mealsTableName: string;
    dayMealsTableName: string;
  },
): Promise<HttpResult> {
  if (!isMealLibraryEnabledLambda()) {
    return json(403, { error: "Meal library is disabled." });
  }
  if (process.env.FF_PHOTO_FOOD_LOG !== "true") {
    return json(403, { error: "Food photo logging is required for meal-complete." });
  }
  const raw = parseJsonBody(event);
  if (raw === null) return json(400, { error: "Invalid JSON" });
  const body = raw as Record<string, unknown>;
  const foodLogId = typeof body.foodLogId === "string" ? body.foodLogId.trim() : "";
  const confirmedKcal = typeof body.confirmedKcal === "number" ? body.confirmedKcal : Number(body.confirmedKcal);
  const confirmedProtein =
    typeof body.confirmedProtein === "number" ? body.confirmedProtein : Number(body.confirmedProtein);
  const dishName = typeof body.dishName === "string" ? body.dishName.trim() : "";
  const mealType = typeof body.mealType === "string" ? body.mealType.trim() : "";
  const saveToLibrary = body.saveToLibrary === true;
  if (!foodLogId || !Number.isFinite(confirmedKcal) || !Number.isFinite(confirmedProtein)) {
    return json(400, { error: "Expected foodLogId, confirmedKcal, confirmedProtein." });
  }
  if (!dishName || !isMealType(mealType)) {
    return json(400, { error: "Expected dishName and valid mealType." });
  }

  const existing = await deps.ddb.send(
    new GetItemCommand({
      TableName: deps.foodLogTableName,
      Key: { userId: { S: userId }, foodLogId: { S: foodLogId } },
      ConsistentRead: true,
    }),
  );
  if (!existing.Item) return json(404, { error: "Food log not found." });
  const day = existing.Item.day?.S ?? "";
  const imageKey = existing.Item.imageKey?.S ?? "";
  if (!isDateString(day)) return json(400, { error: "Invalid food log day." });

  await deps.ddb.send(
    new UpdateItemCommand({
      TableName: deps.foodLogTableName,
      Key: { userId: { S: userId }, foodLogId: { S: foodLogId } },
      UpdateExpression: "SET confirmedKcal = :kc, confirmedProtein = :pr, confirmedTs = :cts",
      ExpressionAttributeValues: {
        ":kc": { N: String(Math.round(confirmedKcal)) },
        ":pr": { N: String(Math.round(confirmedProtein)) },
        ":cts": { S: new Date().toISOString() },
      },
    }),
  );

  const dayKey = `${userId}#${day}`;
  const entryUuid = randomUUID();
  const eSk = entrySk(entryUuid);
  const loggedAt = new Date().toISOString();
  const carbsG = body.carbsG !== undefined ? Number(body.carbsG) : NaN;
  const fatG = body.fatG !== undefined ? Number(body.fatG) : NaN;

  let libraryMealSk: string | undefined;
  if (saveToLibrary) {
    const nlKey = nameLookupKey(userId, dishName);
    const q = await deps.ddb.send(
      new QueryCommand({
        TableName: deps.mealsTableName,
        IndexName: "NameLookupKeyIndex",
        KeyConditionExpression: "nameLookupKey = :k",
        ExpressionAttributeValues: { ":k": { S: nlKey } },
        Limit: 10,
      }),
    );
    let found: MealRow | null = null;
    for (const it of q.Items ?? []) {
      const m = mealFromAttrs(it as Record<string, AttributeValue>);
      if (m && !m.deletedAt) {
        found = m;
        break;
      }
    }
    if (found) {
      libraryMealSk = mealSk(found.id);
      await deps.ddb.send(
        new UpdateItemCommand({
          TableName: deps.mealsTableName,
          Key: { userId: { S: userId }, mealId: { S: libraryMealSk } },
          UpdateExpression:
            "ADD timesLogged :one SET lastLoggedAt = :ts, updatedAt = :ts, estKcal = :kc, estProteinG = :pg",
          ExpressionAttributeValues: {
            ":one": { N: "1" },
            ":ts": { S: loggedAt },
            ":kc": { N: String(Math.round(confirmedKcal)) },
            ":pg": { N: String(Math.round(Number(confirmedProtein) * 10) / 10) },
          },
        }),
      );
    } else {
      const id = randomUUID();
      libraryMealSk = mealSk(id);
      const item: Record<string, AttributeValue> = {
        userId: { S: userId },
        mealId: { S: libraryMealSk },
        nameLookupKey: { S: nlKey },
        name: { S: dishName },
        mealType: { S: mealType },
        estKcal: numAttr(Math.round(confirmedKcal)),
        estProteinG: numAttr(Math.round(Number(confirmedProtein) * 10) / 10),
        source: { S: "photo" },
        timesLogged: { N: "1" },
        lastLoggedAt: { S: loggedAt },
        createdAt: { S: loggedAt },
        updatedAt: { S: loggedAt },
      };
      if (imageKey) item.photoKey = { S: imageKey };
      if (Number.isFinite(carbsG)) item.estCarbsG = numAttr(Math.round(carbsG * 10) / 10);
      if (Number.isFinite(fatG)) item.estFatG = numAttr(Math.round(fatG * 10) / 10);
      await deps.ddb.send(new PutItemCommand({ TableName: deps.mealsTableName, Item: item }));
    }
  }

  const dayItem: Record<string, AttributeValue> = {
    dayKey: { S: dayKey },
    entryId: { S: eSk },
    userId: { S: userId },
    day: { S: day },
    nameSnapshot: { S: dishName },
    mealType: { S: mealType },
    kcal: numAttr(Math.round(confirmedKcal)),
    proteinG: numAttr(Math.round(Number(confirmedProtein) * 10) / 10),
    loggedAt: { S: loggedAt },
  };
  if (imageKey) dayItem.photoKey = { S: imageKey };
  if (Number.isFinite(carbsG)) dayItem.carbsG = numAttr(Math.round(carbsG * 10) / 10);
  if (Number.isFinite(fatG)) dayItem.fatG = numAttr(Math.round(fatG * 10) / 10);
  if (libraryMealSk) {
    dayItem.libraryMealId = { S: libraryMealSk };
    dayItem.mealHistorySk = { S: `${loggedAt}#${eSk}` };
  }

  await deps.ddb.send(new PutItemCommand({ TableName: deps.dayMealsTableName, Item: dayItem }));
  const entry = dayEntryFromAttrs(dayItem as Record<string, AttributeValue>, day);
  return json(200, { ok: true, entry, libraryMealId: libraryMealSk ? stripMealPrefix(libraryMealSk) : null });
}
