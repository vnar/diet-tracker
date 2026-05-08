"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleV2MealsSuggestMatch = handleV2MealsSuggestMatch;
exports.handleV2MealsList = handleV2MealsList;
exports.handleV2MealsCreate = handleV2MealsCreate;
exports.handleV2MealsPatch = handleV2MealsPatch;
exports.handleV2MealsDelete = handleV2MealsDelete;
exports.handleV2MealsHistory = handleV2MealsHistory;
exports.handleV2DayMealEntriesList = handleV2DayMealEntriesList;
exports.handleV2DayMealEntriesCreate = handleV2DayMealEntriesCreate;
exports.handleV2DayMealEntryDelete = handleV2DayMealEntryDelete;
exports.handleV2FoodMealComplete = handleV2FoodMealComplete;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const node_crypto_1 = require("node:crypto");
const fuzzyMatch_1 = require("../../../lib/meals/fuzzyMatch");
const nameLookup_1 = require("../../../lib/meals/nameLookup");
const mealTypes_1 = require("../../../lib/meals/mealTypes");
function json(statusCode, payload) {
    return {
        statusCode,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
    };
}
function parseJsonBody(event) {
    if (!event.body)
        return {};
    try {
        return JSON.parse(event.body);
    }
    catch {
        return null;
    }
}
function isMealLibraryEnabledLambda() {
    return process.env.FF_MEAL_LIBRARY === "true";
}
function isDateString(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function mealSk(uuid) {
    return `MEAL#${uuid}`;
}
function entrySk(uuid) {
    return `ENTRY#${uuid}`;
}
function stripMealPrefix(sk) {
    return sk.startsWith("MEAL#") ? sk.slice(5) : sk;
}
function numAttr(n) {
    return { N: String(n) };
}
function strAttr(s) {
    return { S: s };
}
function mealFromAttrs(it) {
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
    if (!userId || !mealId || !name || !mealType || !(0, mealTypes_1.isMealType)(mealType))
        return null;
    if (!Number.isFinite(estKcal) || !Number.isFinite(estProteinG) || !Number.isFinite(timesLogged))
        return null;
    if (!createdAt || !updatedAt)
        return null;
    if (source !== "photo" && source !== "manual" && source !== "imported" && source !== "ai_parse")
        return null;
    const row = {
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
    if (it.photoKey?.S)
        row.photoKey = it.photoKey.S;
    if (it.estCarbsG?.N != null && Number.isFinite(Number(it.estCarbsG.N)))
        row.estCarbsG = Math.round(Number(it.estCarbsG.N) * 10) / 10;
    if (it.estFatG?.N != null && Number.isFinite(Number(it.estFatG.N)))
        row.estFatG = Math.round(Number(it.estFatG.N) * 10) / 10;
    if (it.lastLoggedAt?.S)
        row.lastLoggedAt = it.lastLoggedAt.S;
    if (it.deletedAt?.S)
        row.deletedAt = it.deletedAt.S;
    return row;
}
function dayEntryFromAttrs(it, day) {
    const entryId = it.entryId?.S;
    const nameSnapshot = it.nameSnapshot?.S;
    const mealType = it.mealType?.S;
    const loggedAt = it.loggedAt?.S;
    if (!entryId || !nameSnapshot || !mealType || !(0, mealTypes_1.isMealType)(mealType) || !loggedAt)
        return null;
    const kcal = it.kcal?.N != null ? Math.round(Number(it.kcal.N)) : null;
    const proteinG = it.proteinG?.N != null ? Math.round(Number(it.proteinG.N) * 10) / 10 : null;
    const row = {
        id: entryId.replace(/^ENTRY#/, ""),
        day,
        nameSnapshot,
        mealType,
        kcal: Number.isFinite(kcal) ? kcal : null,
        proteinG: proteinG != null && Number.isFinite(proteinG) ? proteinG : null,
        loggedAt,
    };
    if (it.libraryMealId?.S)
        row.mealId = stripMealPrefix(it.libraryMealId.S);
    if (it.photoKey?.S)
        row.photoKey = it.photoKey.S;
    if (it.carbsG?.N != null && Number.isFinite(Number(it.carbsG.N)))
        row.carbsG = Math.round(Number(it.carbsG.N) * 10) / 10;
    if (it.fatG?.N != null && Number.isFinite(Number(it.fatG.N)))
        row.fatG = Math.round(Number(it.fatG.N) * 10) / 10;
    if (it.fiberG?.N != null && Number.isFinite(Number(it.fiberG.N)))
        row.fiberG = Math.round(Number(it.fiberG.N) * 10) / 10;
    if (it.notes?.S)
        row.notes = it.notes.S;
    if (it.source?.S)
        row.source = it.source.S;
    if (it.rawInput?.S)
        row.rawInput = it.rawInput.S;
    if (it.deletedAt?.S)
        row.deletedAt = it.deletedAt.S;
    return row;
}
async function queryAllMealsForUser(ddb, table, userId) {
    const out = await ddb.send(new client_dynamodb_1.QueryCommand({
        TableName: table,
        KeyConditionExpression: "userId = :u AND begins_with(mealId, :p)",
        ExpressionAttributeValues: {
            ":u": { S: userId },
            ":p": { S: "MEAL#" },
        },
    }));
    const rows = [];
    for (const it of out.Items ?? []) {
        const m = mealFromAttrs(it);
        if (m && !m.deletedAt)
            rows.push(m);
    }
    return rows;
}
async function handleV2MealsSuggestMatch(userId, event, deps) {
    if (!isMealLibraryEnabledLambda()) {
        return json(403, { error: "Meal library is disabled." });
    }
    const q = event.queryStringParameters?.query?.trim() ?? "";
    if (!q)
        return json(400, { error: "Missing query parameter: query" });
    const meals = await queryAllMealsForUser(deps.ddb, deps.mealsTableName, userId);
    let best = null;
    for (const m of meals) {
        const score = (0, fuzzyMatch_1.trigramSimilarity)(q, m.name);
        if (score >= 0.6 && (!best || score > best.score))
            best = { meal: m, score };
    }
    return json(200, { match: best?.meal ?? null, similarity: best?.score ?? 0 });
}
async function handleV2MealsList(userId, event, deps) {
    if (!isMealLibraryEnabledLambda()) {
        return json(403, { error: "Meal library is disabled." });
    }
    const typeFilter = event.queryStringParameters?.type?.trim();
    const q = event.queryStringParameters?.q?.trim().toLowerCase() ?? "";
    const sort = event.queryStringParameters?.sort?.trim() ?? "recent";
    const limitRaw = event.queryStringParameters?.limit;
    const limit = Math.min(100, Math.max(1, Number(limitRaw) || 50));
    let meals = await queryAllMealsForUser(deps.ddb, deps.mealsTableName, userId);
    if (typeFilter && (0, mealTypes_1.isMealType)(typeFilter)) {
        meals = meals.filter((m) => m.mealType === typeFilter);
    }
    if (q) {
        meals = meals.filter((m) => m.name.toLowerCase().includes(q));
    }
    if (sort === "frequent") {
        meals.sort((a, b) => b.timesLogged - a.timesLogged || (b.lastLoggedAt ?? "").localeCompare(a.lastLoggedAt ?? ""));
    }
    else if (sort === "alpha") {
        meals.sort((a, b) => a.name.localeCompare(b.name));
    }
    else {
        meals.sort((a, b) => (b.lastLoggedAt ?? b.createdAt).localeCompare(a.lastLoggedAt ?? a.createdAt));
    }
    const slice = meals.slice(0, limit);
    return json(200, { items: slice, nextToken: undefined });
}
async function handleV2MealsCreate(userId, event, deps) {
    if (!isMealLibraryEnabledLambda()) {
        return json(403, { error: "Meal library is disabled." });
    }
    const raw = parseJsonBody(event);
    if (raw === null)
        return json(400, { error: "Invalid JSON" });
    const body = raw;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mealType = typeof body.meal_type === "string" ? body.meal_type.trim() : "";
    const kcal = typeof body.kcal === "number" ? body.kcal : Number(body.kcal);
    const proteinG = typeof body.protein_g === "number" ? body.protein_g : Number(body.protein_g);
    const sourceRaw = typeof body.source === "string" ? body.source.trim() : "manual";
    if (!name || !(0, mealTypes_1.isMealType)(mealType) || !Number.isFinite(kcal) || !Number.isFinite(proteinG)) {
        return json(400, { error: "Expected name, meal_type, kcal, protein_g." });
    }
    const source = sourceRaw === "photo" || sourceRaw === "manual" || sourceRaw === "imported" || sourceRaw === "ai_parse"
        ? sourceRaw
        : "manual";
    const nlKey = (0, nameLookup_1.nameLookupKey)(userId, name);
    const existing = await deps.ddb.send(new client_dynamodb_1.QueryCommand({
        TableName: deps.mealsTableName,
        IndexName: "NameLookupKeyIndex",
        KeyConditionExpression: "nameLookupKey = :k",
        ExpressionAttributeValues: { ":k": { S: nlKey } },
        Limit: 5,
    }));
    for (const it of existing.Items ?? []) {
        const m = mealFromAttrs(it);
        if (m && !m.deletedAt)
            return json(200, { meal: m, created: false });
    }
    const id = (0, node_crypto_1.randomUUID)();
    const sk = mealSk(id);
    const now = new Date().toISOString();
    const photoKey = typeof body.photo_key === "string" ? body.photo_key.trim() : "";
    const carbsG = body.carbs_g !== undefined ? (typeof body.carbs_g === "number" ? body.carbs_g : Number(body.carbs_g)) : undefined;
    const fatG = body.fat_g !== undefined ? (typeof body.fat_g === "number" ? body.fat_g : Number(body.fat_g)) : undefined;
    const item = {
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
    if (photoKey)
        item.photoKey = { S: photoKey };
    if (carbsG !== undefined && Number.isFinite(carbsG))
        item.estCarbsG = numAttr(Math.round(carbsG * 10) / 10);
    if (fatG !== undefined && Number.isFinite(fatG))
        item.estFatG = numAttr(Math.round(fatG * 10) / 10);
    await deps.ddb.send(new client_dynamodb_1.PutItemCommand({ TableName: deps.mealsTableName, Item: item }));
    const m = mealFromAttrs(item);
    return json(201, { meal: m, created: true });
}
async function handleV2MealsPatch(userId, mealIdParam, event, deps) {
    if (!isMealLibraryEnabledLambda()) {
        return json(403, { error: "Meal library is disabled." });
    }
    const sk = mealSk(mealIdParam);
    const got = await deps.ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: deps.mealsTableName,
        Key: { userId: { S: userId }, mealId: { S: sk } },
        ConsistentRead: true,
    }));
    if (!got.Item)
        return json(404, { error: "Meal not found." });
    const cur = mealFromAttrs(got.Item);
    if (!cur || cur.deletedAt)
        return json(404, { error: "Meal not found." });
    const raw = parseJsonBody(event);
    if (raw === null)
        return json(400, { error: "Invalid JSON" });
    const body = raw;
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const mealType = typeof body.meal_type === "string" ? body.meal_type.trim() : undefined;
    if (mealType !== undefined && !(0, mealTypes_1.isMealType)(mealType)) {
        return json(400, { error: "Invalid meal_type." });
    }
    const now = new Date().toISOString();
    const exprNames = {};
    const values = { ":u": { S: now } };
    let expr = "SET updatedAt = :u";
    if (name !== undefined) {
        expr += ", #n = :name, nameLookupKey = :nlk";
        exprNames["#n"] = "name";
        values[":name"] = { S: name };
        values[":nlk"] = { S: (0, nameLookup_1.nameLookupKey)(userId, name) };
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
    await deps.ddb.send(new client_dynamodb_1.UpdateItemCommand({
        TableName: deps.mealsTableName,
        Key: { userId: { S: userId }, mealId: { S: sk } },
        UpdateExpression: expr,
        ExpressionAttributeValues: values,
        ...(Object.keys(exprNames).length ? { ExpressionAttributeNames: exprNames } : {}),
    }));
    const again = await deps.ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: deps.mealsTableName,
        Key: { userId: { S: userId }, mealId: { S: sk } },
        ConsistentRead: true,
    }));
    const m = mealFromAttrs((again.Item ?? {}));
    return json(200, { meal: m });
}
async function handleV2MealsDelete(userId, mealIdParam, deps) {
    if (!isMealLibraryEnabledLambda()) {
        return json(403, { error: "Meal library is disabled." });
    }
    const sk = mealSk(mealIdParam);
    const now = new Date().toISOString();
    await deps.ddb.send(new client_dynamodb_1.UpdateItemCommand({
        TableName: deps.mealsTableName,
        Key: { userId: { S: userId }, mealId: { S: sk } },
        UpdateExpression: "SET deletedAt = :d, updatedAt = :d",
        ExpressionAttributeValues: { ":d": { S: now } },
    }));
    return json(200, { ok: true });
}
async function handleV2MealsHistory(userId, mealIdParam, deps) {
    if (!isMealLibraryEnabledLambda()) {
        return json(403, { error: "Meal library is disabled." });
    }
    const libSk = mealSk(mealIdParam);
    const out = await deps.ddb.send(new client_dynamodb_1.QueryCommand({
        TableName: deps.dayMealsTableName,
        IndexName: "MealHistoryIndex",
        KeyConditionExpression: "libraryMealId = :m",
        ExpressionAttributeValues: { ":m": { S: libSk } },
    }));
    const rows = [];
    for (const it of out.Items ?? []) {
        const day = it.day?.S;
        if (!day)
            continue;
        const e = dayEntryFromAttrs(it, day);
        if (!e || e.deletedAt)
            continue;
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
async function handleV2DayMealEntriesList(userId, day, deps) {
    if (!isMealLibraryEnabledLambda()) {
        return json(403, { error: "Meal library is disabled." });
    }
    if (!isDateString(day))
        return json(400, { error: "Invalid day." });
    const dayKey = `${userId}#${day}`;
    const out = await deps.ddb.send(new client_dynamodb_1.QueryCommand({
        TableName: deps.dayMealsTableName,
        KeyConditionExpression: "dayKey = :d",
        ExpressionAttributeValues: { ":d": { S: dayKey } },
    }));
    const items = [];
    for (const it of out.Items ?? []) {
        const e = dayEntryFromAttrs(it, day);
        if (e && !e.deletedAt)
            items.push(e);
    }
    items.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
    return json(200, { items });
}
async function handleV2DayMealEntriesCreate(userId, day, event, deps) {
    if (!isMealLibraryEnabledLambda()) {
        return json(403, { error: "Meal library is disabled." });
    }
    if (!isDateString(day))
        return json(400, { error: "Invalid day." });
    const raw = parseJsonBody(event);
    if (raw === null)
        return json(400, { error: "Invalid JSON" });
    const body = raw;
    const mealIdBody = typeof body.meal_id === "string" ? body.meal_id.trim() : "";
    const dayKey = `${userId}#${day}`;
    const entryUuid = (0, node_crypto_1.randomUUID)();
    const eSk = entrySk(entryUuid);
    const loggedAt = new Date().toISOString();
    if (mealIdBody) {
        const mSk = mealSk(mealIdBody);
        const got = await deps.ddb.send(new client_dynamodb_1.GetItemCommand({
            TableName: deps.mealsTableName,
            Key: { userId: { S: userId }, mealId: { S: mSk } },
            ConsistentRead: true,
        }));
        const meal = mealFromAttrs((got.Item ?? {}));
        if (!meal || meal.deletedAt)
            return json(404, { error: "Meal not found." });
        const item = {
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
        if (meal.photoKey)
            item.photoKey = { S: meal.photoKey };
        if (meal.estCarbsG != null)
            item.carbsG = numAttr(meal.estCarbsG);
        if (meal.estFatG != null)
            item.fatG = numAttr(meal.estFatG);
        await deps.ddb.send(new client_dynamodb_1.PutItemCommand({ TableName: deps.dayMealsTableName, Item: item }));
        await deps.ddb.send(new client_dynamodb_1.UpdateItemCommand({
            TableName: deps.mealsTableName,
            Key: { userId: { S: userId }, mealId: { S: mSk } },
            UpdateExpression: "ADD timesLogged :one SET lastLoggedAt = :ts, updatedAt = :ts",
            ExpressionAttributeValues: {
                ":one": { N: "1" },
                ":ts": { S: loggedAt },
            },
        }));
        const row = dayEntryFromAttrs(item, day);
        return json(201, { entry: row });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const mealType = typeof body.meal_type === "string" ? body.meal_type.trim() : "";
    const kcal = typeof body.kcal === "number" ? body.kcal : Number(body.kcal);
    const proteinG = typeof body.protein_g === "number" ? body.protein_g : Number(body.protein_g);
    if (!name || !(0, mealTypes_1.isMealType)(mealType) || !Number.isFinite(kcal) || !Number.isFinite(proteinG)) {
        return json(400, { error: "Expected meal_id or (name, meal_type, kcal, protein_g)." });
    }
    const photoKey = typeof body.photo_key === "string" ? body.photo_key.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const rawInput = typeof body.raw_input === "string" ? body.raw_input.trim() : "";
    const entrySource = typeof body.source === "string" ? body.source.trim() : "";
    const item = {
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
    if (photoKey)
        item.photoKey = { S: photoKey };
    if (notes)
        item.notes = { S: notes.slice(0, 2000) };
    if (rawInput)
        item.rawInput = { S: rawInput.slice(0, 2000) };
    if (entrySource)
        item.source = { S: entrySource.slice(0, 32) };
    const cg = body.carbs_g !== undefined ? Number(body.carbs_g) : NaN;
    const fg = body.fat_g !== undefined ? Number(body.fat_g) : NaN;
    const fib = body.fiber_g !== undefined ? Number(body.fiber_g) : NaN;
    if (Number.isFinite(cg))
        item.carbsG = numAttr(Math.round(cg * 10) / 10);
    if (Number.isFinite(fg))
        item.fatG = numAttr(Math.round(fg * 10) / 10);
    if (Number.isFinite(fib))
        item.fiberG = numAttr(Math.round(fib * 10) / 10);
    await deps.ddb.send(new client_dynamodb_1.PutItemCommand({ TableName: deps.dayMealsTableName, Item: item }));
    const row = dayEntryFromAttrs(item, day);
    return json(201, { entry: row });
}
async function handleV2DayMealEntryDelete(userId, day, entryIdParam, deps) {
    if (!isMealLibraryEnabledLambda()) {
        return json(403, { error: "Meal library is disabled." });
    }
    if (!isDateString(day))
        return json(400, { error: "Invalid day." });
    const dayKey = `${userId}#${day}`;
    const eSk = entryIdParam.startsWith("ENTRY#") ? entryIdParam : entrySk(entryIdParam);
    const now = new Date().toISOString();
    await deps.ddb.send(new client_dynamodb_1.UpdateItemCommand({
        TableName: deps.dayMealsTableName,
        Key: { dayKey: { S: dayKey }, entryId: { S: eSk } },
        UpdateExpression: "SET deletedAt = :d",
        ExpressionAttributeValues: { ":d": { S: now } },
    }));
    return json(200, { ok: true });
}
async function handleV2FoodMealComplete(userId, event, deps) {
    if (!isMealLibraryEnabledLambda()) {
        return json(403, { error: "Meal library is disabled." });
    }
    if (process.env.FF_PHOTO_FOOD_LOG !== "true") {
        return json(403, { error: "Food photo logging is required for meal-complete." });
    }
    const raw = parseJsonBody(event);
    if (raw === null)
        return json(400, { error: "Invalid JSON" });
    const body = raw;
    const foodLogId = typeof body.foodLogId === "string" ? body.foodLogId.trim() : "";
    const confirmedKcal = typeof body.confirmedKcal === "number" ? body.confirmedKcal : Number(body.confirmedKcal);
    const confirmedProtein = typeof body.confirmedProtein === "number" ? body.confirmedProtein : Number(body.confirmedProtein);
    const dishName = typeof body.dishName === "string" ? body.dishName.trim() : "";
    const mealType = typeof body.mealType === "string" ? body.mealType.trim() : "";
    const saveToLibrary = body.saveToLibrary === true;
    if (!foodLogId || !Number.isFinite(confirmedKcal) || !Number.isFinite(confirmedProtein)) {
        return json(400, { error: "Expected foodLogId, confirmedKcal, confirmedProtein." });
    }
    if (!dishName || !(0, mealTypes_1.isMealType)(mealType)) {
        return json(400, { error: "Expected dishName and valid mealType." });
    }
    const existing = await deps.ddb.send(new client_dynamodb_1.GetItemCommand({
        TableName: deps.foodLogTableName,
        Key: { userId: { S: userId }, foodLogId: { S: foodLogId } },
        ConsistentRead: true,
    }));
    if (!existing.Item)
        return json(404, { error: "Food log not found." });
    const day = existing.Item.day?.S ?? "";
    const imageKey = existing.Item.imageKey?.S ?? "";
    if (!isDateString(day))
        return json(400, { error: "Invalid food log day." });
    await deps.ddb.send(new client_dynamodb_1.UpdateItemCommand({
        TableName: deps.foodLogTableName,
        Key: { userId: { S: userId }, foodLogId: { S: foodLogId } },
        UpdateExpression: "SET confirmedKcal = :kc, confirmedProtein = :pr, confirmedTs = :cts",
        ExpressionAttributeValues: {
            ":kc": { N: String(Math.round(confirmedKcal)) },
            ":pr": { N: String(Math.round(confirmedProtein)) },
            ":cts": { S: new Date().toISOString() },
        },
    }));
    const dayKey = `${userId}#${day}`;
    const entryUuid = (0, node_crypto_1.randomUUID)();
    const eSk = entrySk(entryUuid);
    const loggedAt = new Date().toISOString();
    const carbsG = body.carbsG !== undefined ? Number(body.carbsG) : NaN;
    const fatG = body.fatG !== undefined ? Number(body.fatG) : NaN;
    let libraryMealSk;
    if (saveToLibrary) {
        const nlKey = (0, nameLookup_1.nameLookupKey)(userId, dishName);
        const q = await deps.ddb.send(new client_dynamodb_1.QueryCommand({
            TableName: deps.mealsTableName,
            IndexName: "NameLookupKeyIndex",
            KeyConditionExpression: "nameLookupKey = :k",
            ExpressionAttributeValues: { ":k": { S: nlKey } },
            Limit: 10,
        }));
        let found = null;
        for (const it of q.Items ?? []) {
            const m = mealFromAttrs(it);
            if (m && !m.deletedAt) {
                found = m;
                break;
            }
        }
        if (found) {
            libraryMealSk = mealSk(found.id);
            await deps.ddb.send(new client_dynamodb_1.UpdateItemCommand({
                TableName: deps.mealsTableName,
                Key: { userId: { S: userId }, mealId: { S: libraryMealSk } },
                UpdateExpression: "ADD timesLogged :one SET lastLoggedAt = :ts, updatedAt = :ts, estKcal = :kc, estProteinG = :pg",
                ExpressionAttributeValues: {
                    ":one": { N: "1" },
                    ":ts": { S: loggedAt },
                    ":kc": { N: String(Math.round(confirmedKcal)) },
                    ":pg": { N: String(Math.round(Number(confirmedProtein) * 10) / 10) },
                },
            }));
        }
        else {
            const id = (0, node_crypto_1.randomUUID)();
            libraryMealSk = mealSk(id);
            const item = {
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
            if (imageKey)
                item.photoKey = { S: imageKey };
            if (Number.isFinite(carbsG))
                item.estCarbsG = numAttr(Math.round(carbsG * 10) / 10);
            if (Number.isFinite(fatG))
                item.estFatG = numAttr(Math.round(fatG * 10) / 10);
            await deps.ddb.send(new client_dynamodb_1.PutItemCommand({ TableName: deps.mealsTableName, Item: item }));
        }
    }
    const dayItem = {
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
    if (imageKey)
        dayItem.photoKey = { S: imageKey };
    if (Number.isFinite(carbsG))
        dayItem.carbsG = numAttr(Math.round(carbsG * 10) / 10);
    if (Number.isFinite(fatG))
        dayItem.fatG = numAttr(Math.round(fatG * 10) / 10);
    if (libraryMealSk) {
        dayItem.libraryMealId = { S: libraryMealSk };
        dayItem.mealHistorySk = { S: `${loggedAt}#${eSk}` };
    }
    await deps.ddb.send(new client_dynamodb_1.PutItemCommand({ TableName: deps.dayMealsTableName, Item: dayItem }));
    const entry = dayEntryFromAttrs(dayItem, day);
    return json(200, { ok: true, entry, libraryMealId: libraryMealSk ? stripMealPrefix(libraryMealSk) : null });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVhbHMtYXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibWVhbHMtYXBpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBc01BLDhEQWlCQztBQUVELDhDQThCQztBQUVELGtEQW1FQztBQUVELGdEQTJFQztBQUVELGtEQW1CQztBQUVELG9EQXlDQztBQUVELGdFQXdCQztBQUVELG9FQXNHQztBQUVELGdFQXNCQztBQUVELDREQW1KQztBQXZ2QkQsOERBS2tDO0FBQ2xDLDZDQUF5QztBQUN6Qyw4REFBa0U7QUFDbEUsOERBQThEO0FBQzlELDREQUF5RTtBQWF6RSxTQUFTLElBQUksQ0FBQyxVQUFrQixFQUFFLE9BQWdCO0lBQ2hELE9BQU87UUFDTCxVQUFVO1FBQ1YsT0FBTyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFO1FBQy9DLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztLQUM5QixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLEtBQWdCO0lBQ3JDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSTtRQUFFLE9BQU8sRUFBRSxDQUFDO0lBQzNCLElBQUksQ0FBQztRQUNILE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUFDLE1BQU0sQ0FBQztRQUNQLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLDBCQUEwQjtJQUNqQyxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxLQUFLLE1BQU0sQ0FBQztBQUNoRCxDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUMsQ0FBUztJQUM3QixPQUFPLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBRUQsU0FBUyxNQUFNLENBQUMsSUFBWTtJQUMxQixPQUFPLFFBQVEsSUFBSSxFQUFFLENBQUM7QUFDeEIsQ0FB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LENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDekUsUUFBUTtLQUNULENBQUM7SUFDRixJQUFJLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUFFLEdBQUcsQ0FBQyxNQUFNLEdBQUcsZUFBZSxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUUsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUM7UUFBRSxHQUFHLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ2pELElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksSUFBSSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUQsR0FBRyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUN6RCxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLElBQUksSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFELEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDckQsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxJQUFJLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RCxHQUFHLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxL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QUM7UUFDOUQsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUztZQUFFLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVELE1BQU0sRUFBRSxHQUFHLElBQUEsd0JBQVUsR0FBRSxDQUFDO0lBQ3hCLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN0QixNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3JDLE1BQU0sUUFBUSxHQUFHLE9BQU8sSUFBSSxDQUFDLFNBQVMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUNqRixNQUFNLE1BQU0sR0FDVixJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNwSCxNQUFNLElBQUksR0FDUixJQUFJLENBQUMsS0FBSyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUU1RyxNQUFNLElBQUksR0FBbUM7UUFDM0MsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRTtRQUNyQixNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUs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LENBQUMsQ0FBQztRQUMzRSxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsTUFBTSxJQUFJLEdBQUcsT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ25FLE1BQU0sUUFBUSxHQUFHLE9BQU8sSUFBSSxDQUFDLFNBQVMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUNqRixNQUFNLElBQUksR0FBRyxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzNFLE1BQU0sUUFBUSxHQUFHLE9BQU8sSUFBSSxDQUFDLFNBQVMsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDOUYsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUEsc0JBQVUsRUFBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDM0YsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLHlEQUF5RCxFQUFFLENBQUMsQ0FBQztJQUN6RixDQUFDO0lBQ0QsTUFBTSxRQUFRLEdBQUcsT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ2pGLE1BQU0sS0FBSyxHQUFHLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztJQUN0RSxNQUFNLFFBQVEsR0FBRyxPQUFPLElBQUksQ0FBQyxTQUFTLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDakYsTUFBTSxXQUFXLEdBQUcsT0FBTyxJQUFJLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQzlFLE1BQU0sSUFBSSxHQUFtQztRQUMzQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFO1FBQ3JCLE9BQU8sRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUU7UUFDbkIsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRTtRQUNyQixHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFO1FBQ2YsWUFBWSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRTtRQUN6QixRQUFRLEVBQUUsRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFO1FBQ3pCLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQixRQUFRLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNqRCxRQUFRLEVBQUUsRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFO0tBQzFCLENBQUM7SUFDRixJQUFJLFFBQVE7UUFBRSxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxDQUFDO0lBQzlDLElBQUksS0FBSztRQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQztJQUNwRCxJQUFJLFFBQVE7UUFBRSxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUM7SUFDN0QsSUFBSSxXQUFXO1FBQUUsSUFBSSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUMsRUFBRSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDO0lBQy9ELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxPQUFPLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDbkUsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztJQUMvRCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO0lBQ3BFLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUN6RSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1FBQUUsSUFBSSxDQUFDLElBQUksR0FBRyxP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QyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7QUFDOUcsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgQXR0cmlidXRlVmFsdWUsIER5bmFtb0RCQ2xpZW50IH0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1keW5hbW9kYlwiO1xuaW1wb3J0IHtcbiAgR2V0SXRlbUNvbW1hbmQsXG4gIFB1dEl0ZW1Db21tYW5kLFxuICBRdWVyeUNvbW1hbmQsXG4gIFVwZGF0ZUl0ZW1Db21tYW5kLFxufSBmcm9tIFwiQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiXCI7XG5pbXBvcnQgeyByYW5kb21VVUlEIH0gZnJvbSBcIm5vZGU6Y3J5cHRvXCI7XG5pbXBvcnQgeyB0cmlncmFtU2ltaWxhcml0eSB9IGZyb20gXCIuLi8uLi8uLi9saWIvbWVhbHMvZnV6enlNYXRjaFwiO1xuaW1wb3J0IHsgbmFtZUxvb2t1cEtleSB9IGZyb20gXCIuLi8uLi8uLi9saWIvbWVhbHMvbmFtZUxvb2t1cFwiO1xuaW1wb3J0IHsgaXNNZWFsVHlwZSwgdHlwZSBNZWFsVHlwZSB9IGZyb20gXCIuLi8uLi8uLi9saWIvbWVhbHMvbWVhbFR5cGVzXCI7XG5cbmV4cG9ydCB0eXBlIEh0dHBFdmVudCA9IHtcbiAgYm9keT86IHN0cmluZyB8IG51bGw7XG4gIHF1ZXJ5U3RyaW5nUGFyYW1ldGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCBudWxsO1xufTtcblxuZXhwb3J0IHR5cGUgSHR0cFJlc3VsdCA9IHtcbiAgc3RhdHVzQ29kZTogbnVtYmVyO1xuICBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgYm9keTogc3RyaW5nO1xufTtcblxuZnVuY3Rpb24ganNvbihzdGF0dXNDb2RlOiBudW1iZXIsIHBheWxvYWQ6IHVua25vd24pOiBIdHRwUmVzdWx0IHtcbiAgcmV0dXJuIHtcbiAgICBzdGF0dXNDb2RlLFxuICAgIGhlYWRlcnM6IHsgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gcGFyc2VKc29uQm9keShldmVudDogSHR0cEV2ZW50KTogdW5rbm93biB7XG4gIGlmICghZXZlbnQuYm9keSkgcmV0dXJuIHt9O1xuICB0cnkge1xuICAgIHJldHVybiBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc01lYWxMaWJyYXJ5RW5hYmxlZExhbWJkYSgpOiBib29sZWFuIHtcbiAgcmV0dXJuIHByb2Nlc3MuZW52LkZGX01FQUxfTElCUkFSWSA9PT0gXCJ0cnVlXCI7XG59XG5cbmZ1bmN0aW9uIGlzRGF0ZVN0cmluZyh2OiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9eXFxkezR9LVxcZHsyfS1cXGR7Mn0kLy50ZXN0KHYpO1xufVxuXG5mdW5jdGlvbiBtZWFsU2sodXVpZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBNRUFMIyR7dXVpZH1gO1xufVxuXG5mdW5jdGlvbiBlbnRyeVNrKHV1aWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgRU5UUlkjJHt1dWlkfWA7XG59XG5cbmZ1bmN0aW9uIHN0cmlwTWVhbFByZWZpeChzazogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHNrLnN0YXJ0c1dpdGgoXCJNRUFMI1wiKSA/IHNrLnNsaWNlKDUpIDogc2s7XG59XG5cbmZ1bmN0aW9uIG51bUF0dHIobjogbnVtYmVyKTogQXR0cmlidXRlVmFsdWUge1xuICByZXR1cm4geyBOOiBTdHJpbmcobikgfTtcbn1cblxuZnVuY3Rpb24gc3RyQXR0cihzOiBzdHJpbmcpOiBBdHRyaWJ1dGVWYWx1ZSB7XG4gIHJldHVybiB7IFM6IHMgfTtcbn1cblxudHlwZSBNZWFsUm93ID0ge1xuICBpZDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBtZWFsVHlwZTogTWVhbFR5cGU7XG4gIHBob3RvS2V5Pzogc3RyaW5nO1xuICBlc3RLY2FsOiBudW1iZXI7XG4gIGVzdFByb3RlaW5HOiBudW1iZXI7XG4gIGVzdENhcmJzRz86IG51bWJlcjtcbiAgZXN0RmF0Rz86IG51bWJlcjtcbiAgc291cmNlOiBcInBob3RvXCIgfCBcIm1hbnVhbFwiIHwgXCJpbXBvcnRlZFwiIHwgXCJhaV9wYXJzZVwiO1xuICB0aW1lc0xvZ2dlZDogbnVtYmVyO1xuICBsYXN0TG9nZ2VkQXQ/OiBzdHJpbmc7XG4gIGNyZWF0ZWRBdDogc3RyaW5nO1xuICB1cGRhdGVkQXQ6IHN0cmluZztcbiAgZGVsZXRlZEF0Pzogc3RyaW5nO1xufTtcblxuZnVuY3Rpb24gbWVhbEZyb21BdHRycyhpdDogUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+KTogTWVhbFJvdyB8IG51bGwge1xuICBjb25zdCB1c2VySWQgPSBpdC51c2VySWQ/LlM7XG4gIGNvbnN0IG1lYWxJZCA9IGl0Lm1lYWxJZD8uUztcbiAgY29uc3QgbmFtZSA9IGl0Lm5hbWU/LlM7XG4gIGNvbnN0IG1lYWxUeXBlID0gaXQubWVhbFR5cGU/LlM7XG4gIGNvbnN0IGVzdEtjYWwgPSBpdC5lc3RLY2FsPy5OICE9IG51bGwgPyBOdW1iZXIoaXQuZXN0S2NhbC5OKSA6IE5hTjtcbiAgY29uc3QgZXN0UHJvdGVpbkcgPSBpdC5lc3RQcm90ZWluRz8uTiAhPSBudWxsID8gTnVtYmVyKGl0LmVzdFByb3RlaW5HLk4pIDogTmFOO1xuICBjb25zdCBzb3VyY2UgPSBpdC5zb3VyY2U/LlM7XG4gIGNvbnN0IHRpbWVzTG9nZ2VkID0gaXQudGltZXNMb2dnZWQ/Lk4gIT0gbnVsbCA/IE51bWJlcihpdC50aW1lc0xvZ2dlZC5OKSA6IE5hTjtcbiAgY29uc3QgY3JlYXRlZEF0ID0gaXQuY3JlYXRlZEF0Py5TO1xuICBjb25zdCB1cGRhdGVkQXQgPSBpdC51cGRhdGVkQXQ/LlM7XG4gIGlmICghdXNlcklkIHx8ICFtZWFsSWQgfHwgIW5hbWUgfHwgIW1lYWxUeXBlIHx8ICFpc01lYWxUeXBlKG1lYWxUeXBlKSkgcmV0dXJuIG51bGw7XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKGVzdEtjYWwpIHx8ICFOdW1iZXIuaXNGaW5pdGUoZXN0UHJvdGVpbkcpIHx8ICFOdW1iZXIuaXNGaW5pdGUodGltZXNMb2dnZWQpKVxuICAgIHJldHVybiBudWxsO1xuICBpZiAoIWNyZWF0ZWRBdCB8fCAhdXBkYXRlZEF0KSByZXR1cm4gbnVsbDtcbiAgaWYgKHNvdXJjZSAhPT0gXCJwaG90b1wiICYmIHNvdXJjZSAhPT0gXCJtYW51YWxcIiAmJiBzb3VyY2UgIT09IFwiaW1wb3J0ZWRcIiAmJiBzb3VyY2UgIT09IFwiYWlfcGFyc2VcIikgcmV0dXJuIG51bGw7XG4gIGNvbnN0IHJvdzogTWVhbFJvdyA9IHtcbiAgICBpZDogc3RyaXBNZWFsUHJlZml4KG1lYWxJZCksXG4gICAgdXNlcklkLFxuICAgIG5hbWUsXG4gICAgbWVhbFR5cGUsXG4gICAgZXN0S2NhbDogTWF0aC5yb3VuZChlc3RLY2FsKSxcbiAgICBlc3RQcm90ZWluRzogTWF0aC5yb3VuZChlc3RQcm90ZWluRyAqIDEwKSAvIDEwLFxuICAgIHNvdXJjZSxcbiAgICB0aW1lc0xvZ2dlZDogTWF0aC5yb3VuZCh0aW1lc0xvZ2dlZCksXG4gICAgY3JlYXRlZEF0LFxuICAgIHVwZGF0ZWRBdCxcbiAgfTtcbiAgaWYgKGl0LnBob3RvS2V5Py5TKSByb3cucGhvdG9LZXkgPSBpdC5waG90b0tleS5TO1xuICBpZiAoaXQuZXN0Q2FyYnNHPy5OICE9IG51bGwgJiYgTnVtYmVyLmlzRmluaXRlKE51bWJlcihpdC5lc3RDYXJic0cuTikpKVxuICAgIHJvdy5lc3RDYXJic0cgPSBNYXRoLnJvdW5kKE51bWJlcihpdC5lc3RDYXJic0cuTikgKiAxMCkgLyAxMDtcbiAgaWYgKGl0LmVzdEZhdEc/Lk4gIT0gbnVsbCAmJiBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGl0LmVzdEZhdEcuTikpKVxuICAgIHJvdy5lc3RGYXRHID0gTWF0aC5yb3VuZChOdW1iZXIoaXQuZXN0RmF0Ry5OKSAqIDEwKSAvIDEwO1xuICBpZiAoaXQubGFzdExvZ2dlZEF0Py5TKSByb3cubGFzdExvZ2dlZEF0ID0gaXQubGFzdExvZ2dlZEF0LlM7XG4gIGlmIChpdC5kZWxldGVkQXQ/LlMpIHJvdy5kZWxldGVkQXQgPSBpdC5kZWxldGVkQXQuUztcbiAgcmV0dXJuIHJvdztcbn1cblxudHlwZSBEYXlNZWFsUm93ID0ge1xuICBpZDogc3RyaW5nO1xuICBkYXk6IHN0cmluZztcbiAgbWVhbElkPzogc3RyaW5nO1xuICBuYW1lU25hcHNob3Q6IHN0cmluZztcbiAgbWVhbFR5cGU6IE1lYWxUeXBlO1xuICBwaG90b0tleT86IHN0cmluZztcbiAga2NhbDogbnVtYmVyIHwgbnVsbDtcbiAgcHJvdGVpbkc6IG51bWJlciB8IG51bGw7XG4gIGNhcmJzRz86IG51bWJlciB8IG51bGw7XG4gIGZhdEc/OiBudW1iZXIgfCBudWxsO1xuICBmaWJlckc/OiBudW1iZXIgfCBudWxsO1xuICBsb2dnZWRBdDogc3RyaW5nO1xuICBub3Rlcz86IHN0cmluZztcbiAgc291cmNlPzogc3RyaW5nO1xuICByYXdJbnB1dD86IHN0cmluZztcbiAgZGVsZXRlZEF0Pzogc3RyaW5nO1xufTtcblxuZnVuY3Rpb24gZGF5RW50cnlGcm9tQXR0cnMoaXQ6IFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPiwgZGF5OiBzdHJpbmcpOiBEYXlNZWFsUm93IHwgbnVsbCB7XG4gIGNvbnN0IGVudHJ5SWQgPSBpdC5lbnRyeUlkPy5TO1xuICBjb25zdCBuYW1lU25hcHNob3QgPSBpdC5uYW1lU25hcHNob3Q/LlM7XG4gIGNvbnN0IG1lYWxUeXBlID0gaXQubWVhbFR5cGU/LlM7XG4gIGNvbnN0IGxvZ2dlZEF0ID0gaXQubG9nZ2VkQXQ/LlM7XG4gIGlmICghZW50cnlJZCB8fCAhbmFtZVNuYXBzaG90IHx8ICFtZWFsVHlwZSB8fCAhaXNNZWFsVHlwZShtZWFsVHlwZSkgfHwgIWxvZ2dlZEF0KSByZXR1cm4gbnVsbDtcbiAgY29uc3Qga2NhbCA9IGl0LmtjYWw/Lk4gIT0gbnVsbCA/IE1hdGgucm91bmQoTnVtYmVyKGl0LmtjYWwuTikpIDogbnVsbDtcbiAgY29uc3QgcHJvdGVpbkcgPSBpdC5wcm90ZWluRz8uTiAhPSBudWxsID8gTWF0aC5yb3VuZChOdW1iZXIoaXQucHJvdGVpbkcuTikgKiAxMCkgLyAxMCA6IG51bGw7XG4gIGNvbnN0IHJvdzogRGF5TWVhbFJvdyA9IHtcbiAgICBpZDogZW50cnlJZC5yZXBsYWNlKC9eRU5UUlkjLywgXCJcIiksXG4gICAgZGF5LFxuICAgIG5hbWVTbmFwc2hvdCxcbiAgICBtZWFsVHlwZSxcbiAgICBrY2FsOiBOdW1iZXIuaXNGaW5pdGUoa2NhbCBhcyBudW1iZXIpID8ga2NhbCA6IG51bGwsXG4gICAgcHJvdGVpbkc6IHByb3RlaW5HICE9IG51bGwgJiYgTnVtYmVyLmlzRmluaXRlKHByb3RlaW5HKSA/IHByb3RlaW5HIDogbnVsbCxcbiAgICBsb2dnZWRBdCxcbiAgfTtcbiAgaWYgKGl0LmxpYnJhcnlNZWFsSWQ/LlMpIHJvdy5tZWFsSWQgPSBzdHJpcE1lYWxQcmVmaXgoaXQubGlicmFyeU1lYWxJZC5TKTtcbiAgaWYgKGl0LnBob3RvS2V5Py5TKSByb3cucGhvdG9LZXkgPSBpdC5waG90b0tleS5TO1xuICBpZiAoaXQuY2FyYnNHPy5OICE9IG51bGwgJiYgTnVtYmVyLmlzRmluaXRlKE51bWJlcihpdC5jYXJic0cuTikpKVxuICAgIHJvdy5jYXJic0cgPSBNYXRoLnJvdW5kKE51bWJlcihpdC5jYXJic0cuTikgKiAxMCkgLyAxMDtcbiAgaWYgKGl0LmZhdEc/Lk4gIT0gbnVsbCAmJiBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGl0LmZhdEcuTikpKVxuICAgIHJvdy5mYXRHID0gTWF0aC5yb3VuZChOdW1iZXIoaXQuZmF0Ry5OKSAqIDEwKSAvIDEwO1xuICBpZiAoaXQuZmliZXJHPy5OICE9IG51bGwgJiYgTnVtYmVyLmlzRmluaXRlKE51bWJlcihpdC5maWJlckcuTikpKVxuICAgIHJvdy5maWJlckcgPSBNYXRoLnJvdW5kKE51bWJlcihpdC5maWJlckcuTikgKiAxMCkgLyAxMDtcbiAgaWYgKGl0Lm5vdGVzPy5TKSByb3cubm90ZXMgPSBpdC5ub3Rlcy5TO1xuICBpZiAoaXQuc291cmNlPy5TKSByb3cuc291cmNlID0gaXQuc291cmNlLlM7XG4gIGlmIChpdC5yYXdJbnB1dD8uUykgcm93LnJhd0lucHV0ID0gaXQucmF3SW5wdXQuUztcbiAgaWYgKGl0LmRlbGV0ZWRBdD8uUykgcm93LmRlbGV0ZWRBdCA9IGl0LmRlbGV0ZWRBdC5TO1xuICByZXR1cm4gcm93O1xufVxuXG5hc3luYyBmdW5jdGlvbiBxdWVyeUFsbE1lYWxzRm9yVXNlcihcbiAgZGRiOiBEeW5hbW9EQkNsaWVudCxcbiAgdGFibGU6IHN0cmluZyxcbiAgdXNlcklkOiBzdHJpbmcsXG4pOiBQcm9taXNlPE1lYWxSb3dbXT4ge1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGFibGUsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcInVzZXJJZCA9IDp1IEFORCBiZWdpbnNfd2l0aChtZWFsSWQsIDpwKVwiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjp1XCI6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIFwiOnBcIjogeyBTOiBcIk1FQUwjXCIgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IHJvd3M6IE1lYWxSb3dbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGl0IG9mIG91dC5JdGVtcyA/PyBbXSkge1xuICAgIGNvbnN0IG0gPSBtZWFsRnJvbUF0dHJzKGl0IGFzIFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPik7XG4gICAgaWYgKG0gJiYgIW0uZGVsZXRlZEF0KSByb3dzLnB1c2gobSk7XG4gIH1cbiAgcmV0dXJuIHJvd3M7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVWMk1lYWxzU3VnZ2VzdE1hdGNoKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgZXZlbnQ6IEh0dHBFdmVudCxcbiAgZGVwczogeyBkZGI6IER5bmFtb0RCQ2xpZW50OyBtZWFsc1RhYmxlTmFtZTogc3RyaW5nIH0sXG4pOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgaWYgKCFpc01lYWxMaWJyYXJ5RW5hYmxlZExhbWJkYSgpKSB7XG4gICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBpcyBkaXNhYmxlZC5cIiB9KTtcbiAgfVxuICBjb25zdCBxID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy5xdWVyeT8udHJpbSgpID8/IFwiXCI7XG4gIGlmICghcSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIk1pc3NpbmcgcXVlcnkgcGFyYW1ldGVyOiBxdWVyeVwiIH0pO1xuICBjb25zdCBtZWFscyA9IGF3YWl0IHF1ZXJ5QWxsTWVhbHNGb3JVc2VyKGRlcHMuZGRiLCBkZXBzLm1lYWxzVGFibGVOYW1lLCB1c2VySWQpO1xuICBsZXQgYmVzdDogeyBtZWFsOiBNZWFsUm93OyBzY29yZTogbnVtYmVyIH0gfCBudWxsID0gbnVsbDtcbiAgZm9yIChjb25zdCBtIG9mIG1lYWxzKSB7XG4gICAgY29uc3Qgc2NvcmUgPSB0cmlncmFtU2ltaWxhcml0eShxLCBtLm5hbWUpO1xuICAgIGlmIChzY29yZSA+PSAwLjYgJiYgKCFiZXN0IHx8IHNjb3JlID4gYmVzdC5zY29yZSkpIGJlc3QgPSB7IG1lYWw6IG0sIHNjb3JlIH07XG4gIH1cbiAgcmV0dXJuIGpzb24oMjAwLCB7IG1hdGNoOiBiZXN0Py5tZWFsID8/IG51bGwsIHNpbWlsYXJpdHk6IGJlc3Q/LnNjb3JlID8/IDAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVWMk1lYWxzTGlzdChcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGV2ZW50OiBIdHRwRXZlbnQsXG4gIGRlcHM6IHsgZGRiOiBEeW5hbW9EQkNsaWVudDsgbWVhbHNUYWJsZU5hbWU6IHN0cmluZyB9LFxuKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGlmICghaXNNZWFsTGlicmFyeUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgaXMgZGlzYWJsZWQuXCIgfSk7XG4gIH1cbiAgY29uc3QgdHlwZUZpbHRlciA9IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8udHlwZT8udHJpbSgpO1xuICBjb25zdCBxID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy5xPy50cmltKCkudG9Mb3dlckNhc2UoKSA/PyBcIlwiO1xuICBjb25zdCBzb3J0ID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy5zb3J0Py50cmltKCkgPz8gXCJyZWNlbnRcIjtcbiAgY29uc3QgbGltaXRSYXcgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LmxpbWl0O1xuICBjb25zdCBsaW1pdCA9IE1hdGgubWluKDEwMCwgTWF0aC5tYXgoMSwgTnVtYmVyKGxpbWl0UmF3KSB8fCA1MCkpO1xuXG4gIGxldCBtZWFscyA9IGF3YWl0IHF1ZXJ5QWxsTWVhbHNGb3JVc2VyKGRlcHMuZGRiLCBkZXBzLm1lYWxzVGFibGVOYW1lLCB1c2VySWQpO1xuICBpZiAodHlwZUZpbHRlciAmJiBpc01lYWxUeXBlKHR5cGVGaWx0ZXIpKSB7XG4gICAgbWVhbHMgPSBtZWFscy5maWx0ZXIoKG0pID0+IG0ubWVhbFR5cGUgPT09IHR5cGVGaWx0ZXIpO1xuICB9XG4gIGlmIChxKSB7XG4gICAgbWVhbHMgPSBtZWFscy5maWx0ZXIoKG0pID0+IG0ubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHEpKTtcbiAgfVxuICBpZiAoc29ydCA9PT0gXCJmcmVxdWVudFwiKSB7XG4gICAgbWVhbHMuc29ydCgoYSwgYikgPT4gYi50aW1lc0xvZ2dlZCAtIGEudGltZXNMb2dnZWQgfHwgKGIubGFzdExvZ2dlZEF0ID8/IFwiXCIpLmxvY2FsZUNvbXBhcmUoYS5sYXN0TG9nZ2VkQXQgPz8gXCJcIikpO1xuICB9IGVsc2UgaWYgKHNvcnQgPT09IFwiYWxwaGFcIikge1xuICAgIG1lYWxzLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xuICB9IGVsc2Uge1xuICAgIG1lYWxzLnNvcnQoKGEsIGIpID0+IChiLmxhc3RMb2dnZWRBdCA/PyBiLmNyZWF0ZWRBdCkubG9jYWxlQ29tcGFyZShhLmxhc3RMb2dnZWRBdCA/PyBhLmNyZWF0ZWRBdCkpO1xuICB9XG4gIGNvbnN0IHNsaWNlID0gbWVhbHMuc2xpY2UoMCwgbGltaXQpO1xuICByZXR1cm4ganNvbigyMDAsIHsgaXRlbXM6IHNsaWNlLCBuZXh0VG9rZW46IHVuZGVmaW5lZCB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVYyTWVhbHNDcmVhdGUoXG4gIHVzZXJJZDogc3RyaW5nLFxuICBldmVudDogSHR0cEV2ZW50LFxuICBkZXBzOiB7IGRkYjogRHluYW1vREJDbGllbnQ7IG1lYWxzVGFibGVOYW1lOiBzdHJpbmcgfSxcbik6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBpZiAoIWlzTWVhbExpYnJhcnlFbmFibGVkTGFtYmRhKCkpIHtcbiAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiTWVhbCBsaWJyYXJ5IGlzIGRpc2FibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IHJhdyA9IHBhcnNlSnNvbkJvZHkoZXZlbnQpO1xuICBpZiAocmF3ID09PSBudWxsKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBKU09OXCIgfSk7XG4gIGNvbnN0IGJvZHkgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IG5hbWUgPSB0eXBlb2YgYm9keS5uYW1lID09PSBcInN0cmluZ1wiID8gYm9keS5uYW1lLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IG1lYWxUeXBlID0gdHlwZW9mIGJvZHkubWVhbF90eXBlID09PSBcInN0cmluZ1wiID8gYm9keS5tZWFsX3R5cGUudHJpbSgpIDogXCJcIjtcbiAgY29uc3Qga2NhbCA9IHR5cGVvZiBib2R5LmtjYWwgPT09IFwibnVtYmVyXCIgPyBib2R5LmtjYWwgOiBOdW1iZXIoYm9keS5rY2FsKTtcbiAgY29uc3QgcHJvdGVpbkcgPSB0eXBlb2YgYm9keS5wcm90ZWluX2cgPT09IFwibnVtYmVyXCIgPyBib2R5LnByb3RlaW5fZyA6IE51bWJlcihib2R5LnByb3RlaW5fZyk7XG4gIGNvbnN0IHNvdXJjZVJhdyA9IHR5cGVvZiBib2R5LnNvdXJjZSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuc291cmNlLnRyaW0oKSA6IFwibWFudWFsXCI7XG4gIGlmICghbmFtZSB8fCAhaXNNZWFsVHlwZShtZWFsVHlwZSkgfHwgIU51bWJlci5pc0Zpbml0ZShrY2FsKSB8fCAhTnVtYmVyLmlzRmluaXRlKHByb3RlaW5HKSkge1xuICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJFeHBlY3RlZCBuYW1lLCBtZWFsX3R5cGUsIGtjYWwsIHByb3RlaW5fZy5cIiB9KTtcbiAgfVxuICBjb25zdCBzb3VyY2UgPVxuICAgIHNvdXJjZVJhdyA9PT0gXCJwaG90b1wiIHx8IHNvdXJjZVJhdyA9PT0gXCJtYW51YWxcIiB8fCBzb3VyY2VSYXcgPT09IFwiaW1wb3J0ZWRcIiB8fCBzb3VyY2VSYXcgPT09IFwiYWlfcGFyc2VcIlxuICAgICAgPyBzb3VyY2VSYXdcbiAgICAgIDogXCJtYW51YWxcIjtcbiAgY29uc3QgbmxLZXkgPSBuYW1lTG9va3VwS2V5KHVzZXJJZCwgbmFtZSk7XG4gIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgZGVwcy5kZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogZGVwcy5tZWFsc1RhYmxlTmFtZSxcbiAgICAgIEluZGV4TmFtZTogXCJOYW1lTG9va3VwS2V5SW5kZXhcIixcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwibmFtZUxvb2t1cEtleSA9IDprXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOmtcIjogeyBTOiBubEtleSB9IH0sXG4gICAgICBMaW1pdDogNSxcbiAgICB9KSxcbiAgKTtcbiAgZm9yIChjb25zdCBpdCBvZiBleGlzdGluZy5JdGVtcyA/PyBbXSkge1xuICAgIGNvbnN0IG0gPSBtZWFsRnJvbUF0dHJzKGl0IGFzIFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPik7XG4gICAgaWYgKG0gJiYgIW0uZGVsZXRlZEF0KSByZXR1cm4ganNvbigyMDAsIHsgbWVhbDogbSwgY3JlYXRlZDogZmFsc2UgfSk7XG4gIH1cblxuICBjb25zdCBpZCA9IHJhbmRvbVVVSUQoKTtcbiAgY29uc3Qgc2sgPSBtZWFsU2soaWQpO1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGNvbnN0IHBob3RvS2V5ID0gdHlwZW9mIGJvZHkucGhvdG9fa2V5ID09PSBcInN0cmluZ1wiID8gYm9keS5waG90b19rZXkudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgY2FyYnNHID1cbiAgICBib2R5LmNhcmJzX2cgIT09IHVuZGVmaW5lZCA/ICh0eXBlb2YgYm9keS5jYXJic19nID09PSBcIm51bWJlclwiID8gYm9keS5jYXJic19nIDogTnVtYmVyKGJvZHkuY2FyYnNfZykpIDogdW5kZWZpbmVkO1xuICBjb25zdCBmYXRHID1cbiAgICBib2R5LmZhdF9nICE9PSB1bmRlZmluZWQgPyAodHlwZW9mIGJvZHkuZmF0X2cgPT09IFwibnVtYmVyXCIgPyBib2R5LmZhdF9nIDogTnVtYmVyKGJvZHkuZmF0X2cpKSA6IHVuZGVmaW5lZDtcblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4gPSB7XG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIG1lYWxJZDogeyBTOiBzayB9LFxuICAgIG5hbWVMb29rdXBLZXk6IHsgUzogbmxLZXkgfSxcbiAgICBuYW1lOiB7IFM6IG5hbWUgfSxcbiAgICBtZWFsVHlwZTogeyBTOiBtZWFsVHlwZSB9LFxuICAgIGVzdEtjYWw6IG51bUF0dHIoTWF0aC5yb3VuZChrY2FsKSksXG4gICAgZXN0UHJvdGVpbkc6IG51bUF0dHIoTWF0aC5yb3VuZChwcm90ZWluRyAqIDEwKSAvIDEwKSxcbiAgICBzb3VyY2U6IHsgUzogc291cmNlIH0sXG4gICAgdGltZXNMb2dnZWQ6IHsgTjogXCIwXCIgfSxcbiAgICBjcmVhdGVkQXQ6IHsgUzogbm93IH0sXG4gICAgdXBkYXRlZEF0OiB7IFM6IG5vdyB9LFxuICB9O1xuICBpZiAocGhvdG9LZXkpIGl0ZW0ucGhvdG9LZXkgPSB7IFM6IHBob3RvS2V5IH07XG4gIGlmIChjYXJic0cgIT09IHVuZGVmaW5lZCAmJiBOdW1iZXIuaXNGaW5pdGUoY2FyYnNHKSkgaXRlbS5lc3RDYXJic0cgPSBudW1BdHRyKE1hdGgucm91bmQoY2FyYnNHICogMTApIC8gMTApO1xuICBpZiAoZmF0RyAhPT0gdW5kZWZpbmVkICYmIE51bWJlci5pc0Zpbml0ZShmYXRHKSkgaXRlbS5lc3RGYXRHID0gbnVtQXR0cihNYXRoLnJvdW5kKGZhdEcgKiAxMCkgLyAxMCk7XG5cbiAgYXdhaXQgZGVwcy5kZGIuc2VuZChuZXcgUHV0SXRlbUNvbW1hbmQoeyBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsIEl0ZW06IGl0ZW0gfSkpO1xuICBjb25zdCBtID0gbWVhbEZyb21BdHRycyhpdGVtIGFzIFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPik7XG4gIHJldHVybiBqc29uKDIwMSwgeyBtZWFsOiBtLCBjcmVhdGVkOiB0cnVlIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlVjJNZWFsc1BhdGNoKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgbWVhbElkUGFyYW06IHN0cmluZyxcbiAgZXZlbnQ6IEh0dHBFdmVudCxcbiAgZGVwczogeyBkZGI6IER5bmFtb0RCQ2xpZW50OyBtZWFsc1RhYmxlTmFtZTogc3RyaW5nIH0sXG4pOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgaWYgKCFpc01lYWxMaWJyYXJ5RW5hYmxlZExhbWJkYSgpKSB7XG4gICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBpcyBkaXNhYmxlZC5cIiB9KTtcbiAgfVxuICBjb25zdCBzayA9IG1lYWxTayhtZWFsSWRQYXJhbSk7XG4gIGNvbnN0IGdvdCA9IGF3YWl0IGRlcHMuZGRiLnNlbmQoXG4gICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogZGVwcy5tZWFsc1RhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0sIG1lYWxJZDogeyBTOiBzayB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgaWYgKCFnb3QuSXRlbSkgcmV0dXJuIGpzb24oNDA0LCB7IGVycm9yOiBcIk1lYWwgbm90IGZvdW5kLlwiIH0pO1xuICBjb25zdCBjdXIgPSBtZWFsRnJvbUF0dHJzKGdvdC5JdGVtIGFzIFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPik7XG4gIGlmICghY3VyIHx8IGN1ci5kZWxldGVkQXQpIHJldHVybiBqc29uKDQwNCwgeyBlcnJvcjogXCJNZWFsIG5vdCBmb3VuZC5cIiB9KTtcblxuICBjb25zdCByYXcgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKHJhdyA9PT0gbnVsbCkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICBjb25zdCBib2R5ID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBuYW1lID0gdHlwZW9mIGJvZHkubmFtZSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubmFtZS50cmltKCkgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IG1lYWxUeXBlID0gdHlwZW9mIGJvZHkubWVhbF90eXBlID09PSBcInN0cmluZ1wiID8gYm9keS5tZWFsX3R5cGUudHJpbSgpIDogdW5kZWZpbmVkO1xuICBpZiAobWVhbFR5cGUgIT09IHVuZGVmaW5lZCAmJiAhaXNNZWFsVHlwZShtZWFsVHlwZSkpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBtZWFsX3R5cGUuXCIgfSk7XG4gIH1cbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBjb25zdCBleHByTmFtZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgY29uc3QgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4gPSB7IFwiOnVcIjogeyBTOiBub3cgfSB9O1xuICBsZXQgZXhwciA9IFwiU0VUIHVwZGF0ZWRBdCA9IDp1XCI7XG4gIGlmIChuYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICBleHByICs9IFwiLCAjbiA9IDpuYW1lLCBuYW1lTG9va3VwS2V5ID0gOm5sa1wiO1xuICAgIGV4cHJOYW1lc1tcIiNuXCJdID0gXCJuYW1lXCI7XG4gICAgdmFsdWVzW1wiOm5hbWVcIl0gPSB7IFM6IG5hbWUgfTtcbiAgICB2YWx1ZXNbXCI6bmxrXCJdID0geyBTOiBuYW1lTG9va3VwS2V5KHVzZXJJZCwgbmFtZSkgfTtcbiAgfVxuICBpZiAobWVhbFR5cGUgIT09IHVuZGVmaW5lZCkge1xuICAgIGV4cHIgKz0gXCIsIG1lYWxUeXBlID0gOm10XCI7XG4gICAgdmFsdWVzW1wiOm10XCJdID0geyBTOiBtZWFsVHlwZSB9O1xuICB9XG4gIGlmIChib2R5LmVzdF9rY2FsICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBrID0gdHlwZW9mIGJvZHkuZXN0X2tjYWwgPT09IFwibnVtYmVyXCIgPyBib2R5LmVzdF9rY2FsIDogTnVtYmVyKGJvZHkuZXN0X2tjYWwpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoaykpIHtcbiAgICAgIGV4cHIgKz0gXCIsIGVzdEtjYWwgPSA6a2NcIjtcbiAgICAgIHZhbHVlc1tcIjprY1wiXSA9IG51bUF0dHIoTWF0aC5yb3VuZChrKSk7XG4gICAgfVxuICB9XG4gIGlmIChib2R5LmVzdF9wcm90ZWluX2cgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IHAgPSB0eXBlb2YgYm9keS5lc3RfcHJvdGVpbl9nID09PSBcIm51bWJlclwiID8gYm9keS5lc3RfcHJvdGVpbl9nIDogTnVtYmVyKGJvZHkuZXN0X3Byb3RlaW5fZyk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShwKSkge1xuICAgICAgZXhwciArPSBcIiwgZXN0UHJvdGVpbkcgPSA6cGdcIjtcbiAgICAgIHZhbHVlc1tcIjpwZ1wiXSA9IG51bUF0dHIoTWF0aC5yb3VuZChwICogMTApIC8gMTApO1xuICAgIH1cbiAgfVxuICBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9LCBtZWFsSWQ6IHsgUzogc2sgfSB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogZXhwcixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHZhbHVlcyxcbiAgICAgIC4uLihPYmplY3Qua2V5cyhleHByTmFtZXMpLmxlbmd0aCA/IHsgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiBleHByTmFtZXMgfSA6IHt9KSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgYWdhaW4gPSBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9LCBtZWFsSWQ6IHsgUzogc2sgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IG0gPSBtZWFsRnJvbUF0dHJzKChhZ2Fpbi5JdGVtID8/IHt9KSBhcyBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4pO1xuICByZXR1cm4ganNvbigyMDAsIHsgbWVhbDogbSB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVYyTWVhbHNEZWxldGUoXG4gIHVzZXJJZDogc3RyaW5nLFxuICBtZWFsSWRQYXJhbTogc3RyaW5nLFxuICBkZXBzOiB7IGRkYjogRHluYW1vREJDbGllbnQ7IG1lYWxzVGFibGVOYW1lOiBzdHJpbmcgfSxcbik6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBpZiAoIWlzTWVhbExpYnJhcnlFbmFibGVkTGFtYmRhKCkpIHtcbiAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiTWVhbCBsaWJyYXJ5IGlzIGRpc2FibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IHNrID0gbWVhbFNrKG1lYWxJZFBhcmFtKTtcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9LCBtZWFsSWQ6IHsgUzogc2sgfSB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogXCJTRVQgZGVsZXRlZEF0ID0gOmQsIHVwZGF0ZWRBdCA9IDpkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOmRcIjogeyBTOiBub3cgfSB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVWMk1lYWxzSGlzdG9yeShcbiAgdXNlcklkOiBzdHJpbmcsXG4gIG1lYWxJZFBhcmFtOiBzdHJpbmcsXG4gIGRlcHM6IHsgZGRiOiBEeW5hbW9EQkNsaWVudDsgZGF5TWVhbHNUYWJsZU5hbWU6IHN0cmluZyB9LFxuKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGlmICghaXNNZWFsTGlicmFyeUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgaXMgZGlzYWJsZWQuXCIgfSk7XG4gIH1cbiAgY29uc3QgbGliU2sgPSBtZWFsU2sobWVhbElkUGFyYW0pO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBkZXBzLmRheU1lYWxzVGFibGVOYW1lLFxuICAgICAgSW5kZXhOYW1lOiBcIk1lYWxIaXN0b3J5SW5kZXhcIixcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwibGlicmFyeU1lYWxJZCA9IDptXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOm1cIjogeyBTOiBsaWJTayB9IH0sXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IHJvd3M6IEFycmF5PHtcbiAgICBkYXk6IHN0cmluZztcbiAgICBuYW1lU25hcHNob3Q6IHN0cmluZztcbiAgICBrY2FsOiBudW1iZXIgfCBudWxsO1xuICAgIHByb3RlaW5HOiBudW1iZXIgfCBudWxsO1xuICAgIGxvZ2dlZEF0OiBzdHJpbmc7XG4gICAgbm90ZXM/OiBzdHJpbmc7XG4gIH0+ID0gW107XG4gIGZvciAoY29uc3QgaXQgb2Ygb3V0Lkl0ZW1zID8/IFtdKSB7XG4gICAgY29uc3QgZGF5ID0gaXQuZGF5Py5TO1xuICAgIGlmICghZGF5KSBjb250aW51ZTtcbiAgICBjb25zdCBlID0gZGF5RW50cnlGcm9tQXR0cnMoaXQgYXMgUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+LCBkYXkpO1xuICAgIGlmICghZSB8fCBlLmRlbGV0ZWRBdCkgY29udGludWU7XG4gICAgcm93cy5wdXNoKHtcbiAgICAgIGRheTogZS5kYXksXG4gICAgICBuYW1lU25hcHNob3Q6IGUubmFtZVNuYXBzaG90LFxuICAgICAga2NhbDogZS5rY2FsLFxuICAgICAgcHJvdGVpbkc6IGUucHJvdGVpbkcsXG4gICAgICBsb2dnZWRBdDogZS5sb2dnZWRBdCxcbiAgICAgIG5vdGVzOiBlLm5vdGVzLFxuICAgIH0pO1xuICB9XG4gIHJvd3Muc29ydCgoYSwgYikgPT4gYS5sb2dnZWRBdC5sb2NhbGVDb21wYXJlKGIubG9nZ2VkQXQpKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IGl0ZW1zOiByb3dzIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlVjJEYXlNZWFsRW50cmllc0xpc3QoXG4gIHVzZXJJZDogc3RyaW5nLFxuICBkYXk6IHN0cmluZyxcbiAgZGVwczogeyBkZGI6IER5bmFtb0RCQ2xpZW50OyBkYXlNZWFsc1RhYmxlTmFtZTogc3RyaW5nIH0sXG4pOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgaWYgKCFpc01lYWxMaWJyYXJ5RW5hYmxlZExhbWJkYSgpKSB7XG4gICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBpcyBkaXNhYmxlZC5cIiB9KTtcbiAgfVxuICBpZiAoIWlzRGF0ZVN0cmluZyhkYXkpKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXkuXCIgfSk7XG4gIGNvbnN0IGRheUtleSA9IGAke3VzZXJJZH0jJHtkYXl9YDtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGVwcy5kZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogZGVwcy5kYXlNZWFsc1RhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwiZGF5S2V5ID0gOmRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6ZFwiOiB7IFM6IGRheUtleSB9IH0sXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IGl0ZW1zOiBEYXlNZWFsUm93W10gPSBbXTtcbiAgZm9yIChjb25zdCBpdCBvZiBvdXQuSXRlbXMgPz8gW10pIHtcbiAgICBjb25zdCBlID0gZGF5RW50cnlGcm9tQXR0cnMoaXQgYXMgUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+LCBkYXkpO1xuICAgIGlmIChlICYmICFlLmRlbGV0ZWRBdCkgaXRlbXMucHVzaChlKTtcbiAgfVxuICBpdGVtcy5zb3J0KChhLCBiKSA9PiBiLmxvZ2dlZEF0LmxvY2FsZUNvbXBhcmUoYS5sb2dnZWRBdCkpO1xuICByZXR1cm4ganNvbigyMDAsIHsgaXRlbXMgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVWMkRheU1lYWxFbnRyaWVzQ3JlYXRlKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgZGF5OiBzdHJpbmcsXG4gIGV2ZW50OiBIdHRwRXZlbnQsXG4gIGRlcHM6IHsgZGRiOiBEeW5hbW9EQkNsaWVudDsgZGF5TWVhbHNUYWJsZU5hbWU6IHN0cmluZzsgbWVhbHNUYWJsZU5hbWU6IHN0cmluZyB9LFxuKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGlmICghaXNNZWFsTGlicmFyeUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgaXMgZGlzYWJsZWQuXCIgfSk7XG4gIH1cbiAgaWYgKCFpc0RhdGVTdHJpbmcoZGF5KSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgZGF5LlwiIH0pO1xuICBjb25zdCByYXcgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKHJhdyA9PT0gbnVsbCkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICBjb25zdCBib2R5ID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBtZWFsSWRCb2R5ID0gdHlwZW9mIGJvZHkubWVhbF9pZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubWVhbF9pZC50cmltKCkgOiBcIlwiO1xuXG4gIGNvbnN0IGRheUtleSA9IGAke3VzZXJJZH0jJHtkYXl9YDtcbiAgY29uc3QgZW50cnlVdWlkID0gcmFuZG9tVVVJRCgpO1xuICBjb25zdCBlU2sgPSBlbnRyeVNrKGVudHJ5VXVpZCk7XG4gIGNvbnN0IGxvZ2dlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuXG4gIGlmIChtZWFsSWRCb2R5KSB7XG4gICAgY29uc3QgbVNrID0gbWVhbFNrKG1lYWxJZEJvZHkpO1xuICAgIGNvbnN0IGdvdCA9IGF3YWl0IGRlcHMuZGRiLnNlbmQoXG4gICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0sIG1lYWxJZDogeyBTOiBtU2sgfSB9LFxuICAgICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgY29uc3QgbWVhbCA9IG1lYWxGcm9tQXR0cnMoKGdvdC5JdGVtID8/IHt9KSBhcyBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4pO1xuICAgIGlmICghbWVhbCB8fCBtZWFsLmRlbGV0ZWRBdCkgcmV0dXJuIGpzb24oNDA0LCB7IGVycm9yOiBcIk1lYWwgbm90IGZvdW5kLlwiIH0pO1xuXG4gICAgY29uc3QgaXRlbTogUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+ID0ge1xuICAgICAgZGF5S2V5OiB7IFM6IGRheUtleSB9LFxuICAgICAgZW50cnlJZDogeyBTOiBlU2sgfSxcbiAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgIGRheTogeyBTOiBkYXkgfSxcbiAgICAgIG5hbWVTbmFwc2hvdDogeyBTOiBtZWFsLm5hbWUgfSxcbiAgICAgIG1lYWxUeXBlOiB7IFM6IG1lYWwubWVhbFR5cGUgfSxcbiAgICAgIGtjYWw6IG51bUF0dHIobWVhbC5lc3RLY2FsKSxcbiAgICAgIHByb3RlaW5HOiBudW1BdHRyKG1lYWwuZXN0UHJvdGVpbkcpLFxuICAgICAgbG9nZ2VkQXQ6IHsgUzogbG9nZ2VkQXQgfSxcbiAgICAgIGxpYnJhcnlNZWFsSWQ6IHsgUzogbVNrIH0sXG4gICAgICBtZWFsSGlzdG9yeVNrOiB7IFM6IGAke2xvZ2dlZEF0fSMke2VTa31gIH0sXG4gICAgfTtcbiAgICBpZiAobWVhbC5waG90b0tleSkgaXRlbS5waG90b0tleSA9IHsgUzogbWVhbC5waG90b0tleSB9O1xuICAgIGlmIChtZWFsLmVzdENhcmJzRyAhPSBudWxsKSBpdGVtLmNhcmJzRyA9IG51bUF0dHIobWVhbC5lc3RDYXJic0cpO1xuICAgIGlmIChtZWFsLmVzdEZhdEcgIT0gbnVsbCkgaXRlbS5mYXRHID0gbnVtQXR0cihtZWFsLmVzdEZhdEcpO1xuXG4gICAgYXdhaXQgZGVwcy5kZGIuc2VuZChuZXcgUHV0SXRlbUNvbW1hbmQoeyBUYWJsZU5hbWU6IGRlcHMuZGF5TWVhbHNUYWJsZU5hbWUsIEl0ZW06IGl0ZW0gfSkpO1xuICAgIGF3YWl0IGRlcHMuZGRiLnNlbmQoXG4gICAgICBuZXcgVXBkYXRlSXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0sIG1lYWxJZDogeyBTOiBtU2sgfSB9LFxuICAgICAgICBVcGRhdGVFeHByZXNzaW9uOlxuICAgICAgICAgIFwiQUREIHRpbWVzTG9nZ2VkIDpvbmUgU0VUIGxhc3RMb2dnZWRBdCA9IDp0cywgdXBkYXRlZEF0ID0gOnRzXCIsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgICBcIjpvbmVcIjogeyBOOiBcIjFcIiB9LFxuICAgICAgICAgIFwiOnRzXCI6IHsgUzogbG9nZ2VkQXQgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgY29uc3Qgcm93ID0gZGF5RW50cnlGcm9tQXR0cnMoaXRlbSBhcyBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4sIGRheSk7XG4gICAgcmV0dXJuIGpzb24oMjAxLCB7IGVudHJ5OiByb3cgfSk7XG4gIH1cblxuICBjb25zdCBuYW1lID0gdHlwZW9mIGJvZHkubmFtZSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubmFtZS50cmltKCkgOiBcIlwiO1xuICBjb25zdCBtZWFsVHlwZSA9IHR5cGVvZiBib2R5Lm1lYWxfdHlwZSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubWVhbF90eXBlLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGtjYWwgPSB0eXBlb2YgYm9keS5rY2FsID09PSBcIm51bWJlclwiID8gYm9keS5rY2FsIDogTnVtYmVyKGJvZHkua2NhbCk7XG4gIGNvbnN0IHByb3RlaW5HID0gdHlwZW9mIGJvZHkucHJvdGVpbl9nID09PSBcIm51bWJlclwiID8gYm9keS5wcm90ZWluX2cgOiBOdW1iZXIoYm9keS5wcm90ZWluX2cpO1xuICBpZiAoIW5hbWUgfHwgIWlzTWVhbFR5cGUobWVhbFR5cGUpIHx8ICFOdW1iZXIuaXNGaW5pdGUoa2NhbCkgfHwgIU51bWJlci5pc0Zpbml0ZShwcm90ZWluRykpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiRXhwZWN0ZWQgbWVhbF9pZCBvciAobmFtZSwgbWVhbF90eXBlLCBrY2FsLCBwcm90ZWluX2cpLlwiIH0pO1xuICB9XG4gIGNvbnN0IHBob3RvS2V5ID0gdHlwZW9mIGJvZHkucGhvdG9fa2V5ID09PSBcInN0cmluZ1wiID8gYm9keS5waG90b19rZXkudHJpbSgpIDogXCJcIjtcbiAgY29uc3Qgbm90ZXMgPSB0eXBlb2YgYm9keS5ub3RlcyA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubm90ZXMudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgcmF3SW5wdXQgPSB0eXBlb2YgYm9keS5yYXdfaW5wdXQgPT09IFwic3RyaW5nXCIgPyBib2R5LnJhd19pbnB1dC50cmltKCkgOiBcIlwiO1xuICBjb25zdCBlbnRyeVNvdXJjZSA9IHR5cGVvZiBib2R5LnNvdXJjZSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkuc291cmNlLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGl0ZW06IFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPiA9IHtcbiAgICBkYXlLZXk6IHsgUzogZGF5S2V5IH0sXG4gICAgZW50cnlJZDogeyBTOiBlU2sgfSxcbiAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgZGF5OiB7IFM6IGRheSB9LFxuICAgIG5hbWVTbmFwc2hvdDogeyBTOiBuYW1lIH0sXG4gICAgbWVhbFR5cGU6IHsgUzogbWVhbFR5cGUgfSxcbiAgICBrY2FsOiBudW1BdHRyKE1hdGgucm91bmQoa2NhbCkpLFxuICAgIHByb3RlaW5HOiBudW1BdHRyKE1hdGgucm91bmQocHJvdGVpbkcgKiAxMCkgLyAxMCksXG4gICAgbG9nZ2VkQXQ6IHsgUzogbG9nZ2VkQXQgfSxcbiAgfTtcbiAgaWYgKHBob3RvS2V5KSBpdGVtLnBob3RvS2V5ID0geyBTOiBwaG90b0tleSB9O1xuICBpZiAobm90ZXMpIGl0ZW0ubm90ZXMgPSB7IFM6IG5vdGVzLnNsaWNlKDAsIDIwMDApIH07XG4gIGlmIChyYXdJbnB1dCkgaXRlbS5yYXdJbnB1dCA9IHsgUzogcmF3SW5wdXQuc2xpY2UoMCwgMjAwMCkgfTtcbiAgaWYgKGVudHJ5U291cmNlKSBpdGVtLnNvdXJjZSA9IHsgUzogZW50cnlTb3VyY2Uuc2xpY2UoMCwgMzIpIH07XG4gIGNvbnN0IGNnID0gYm9keS5jYXJic19nICE9PSB1bmRlZmluZWQgPyBOdW1iZXIoYm9keS5jYXJic19nKSA6IE5hTjtcbiAgY29uc3QgZmcgPSBib2R5LmZhdF9nICE9PSB1bmRlZmluZWQgPyBOdW1iZXIoYm9keS5mYXRfZykgOiBOYU47XG4gIGNvbnN0IGZpYiA9IGJvZHkuZmliZXJfZyAhPT0gdW5kZWZpbmVkID8gTnVtYmVyKGJvZHkuZmliZXJfZykgOiBOYU47XG4gIGlmIChOdW1iZXIuaXNGaW5pdGUoY2cpKSBpdGVtLmNhcmJzRyA9IG51bUF0dHIoTWF0aC5yb3VuZChjZyAqIDEwKSAvIDEwKTtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShmZykpIGl0ZW0uZmF0RyA9IG51bUF0dHIoTWF0aC5yb3VuZChmZyAqIDEwKSAvIDEwKTtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShmaWIpKSBpdGVtLmZpYmVyRyA9IG51bUF0dHIoTWF0aC5yb3VuZChmaWIgKiAxMCkgLyAxMCk7XG5cbiAgYXdhaXQgZGVwcy5kZGIuc2VuZChuZXcgUHV0SXRlbUNvbW1hbmQoeyBUYWJsZU5hbWU6IGRlcHMuZGF5TWVhbHNUYWJsZU5hbWUsIEl0ZW06IGl0ZW0gfSkpO1xuICBjb25zdCByb3cgPSBkYXlFbnRyeUZyb21BdHRycyhpdGVtIGFzIFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPiwgZGF5KTtcbiAgcmV0dXJuIGpzb24oMjAxLCB7IGVudHJ5OiByb3cgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVWMkRheU1lYWxFbnRyeURlbGV0ZShcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGRheTogc3RyaW5nLFxuICBlbnRyeUlkUGFyYW06IHN0cmluZyxcbiAgZGVwczogeyBkZGI6IER5bmFtb0RCQ2xpZW50OyBkYXlNZWFsc1RhYmxlTmFtZTogc3RyaW5nIH0sXG4pOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgaWYgKCFpc01lYWxMaWJyYXJ5RW5hYmxlZExhbWJkYSgpKSB7XG4gICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBpcyBkaXNhYmxlZC5cIiB9KTtcbiAgfVxuICBpZiAoIWlzRGF0ZVN0cmluZyhkYXkpKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXkuXCIgfSk7XG4gIGNvbnN0IGRheUtleSA9IGAke3VzZXJJZH0jJHtkYXl9YDtcbiAgY29uc3QgZVNrID0gZW50cnlJZFBhcmFtLnN0YXJ0c1dpdGgoXCJFTlRSWSNcIikgPyBlbnRyeUlkUGFyYW0gOiBlbnRyeVNrKGVudHJ5SWRQYXJhbSk7XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgYXdhaXQgZGVwcy5kZGIuc2VuZChcbiAgICBuZXcgVXBkYXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBkZXBzLmRheU1lYWxzVGFibGVOYW1lLFxuICAgICAgS2V5OiB7IGRheUtleTogeyBTOiBkYXlLZXkgfSwgZW50cnlJZDogeyBTOiBlU2sgfSB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogXCJTRVQgZGVsZXRlZEF0ID0gOmRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6ZFwiOiB7IFM6IG5vdyB9IH0sXG4gICAgfSksXG4gICk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBvazogdHJ1ZSB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVYyRm9vZE1lYWxDb21wbGV0ZShcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGV2ZW50OiBIdHRwRXZlbnQsXG4gIGRlcHM6IHtcbiAgICBkZGI6IER5bmFtb0RCQ2xpZW50O1xuICAgIGZvb2RMb2dUYWJsZU5hbWU6IHN0cmluZztcbiAgICBtZWFsc1RhYmxlTmFtZTogc3RyaW5nO1xuICAgIGRheU1lYWxzVGFibGVOYW1lOiBzdHJpbmc7XG4gIH0sXG4pOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgaWYgKCFpc01lYWxMaWJyYXJ5RW5hYmxlZExhbWJkYSgpKSB7XG4gICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBpcyBkaXNhYmxlZC5cIiB9KTtcbiAgfVxuICBpZiAocHJvY2Vzcy5lbnYuRkZfUEhPVE9fRk9PRF9MT0cgIT09IFwidHJ1ZVwiKSB7XG4gICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIkZvb2QgcGhvdG8gbG9nZ2luZyBpcyByZXF1aXJlZCBmb3IgbWVhbC1jb21wbGV0ZS5cIiB9KTtcbiAgfVxuICBjb25zdCByYXcgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKHJhdyA9PT0gbnVsbCkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICBjb25zdCBib2R5ID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBmb29kTG9nSWQgPSB0eXBlb2YgYm9keS5mb29kTG9nSWQgPT09IFwic3RyaW5nXCIgPyBib2R5LmZvb2RMb2dJZC50cmltKCkgOiBcIlwiO1xuICBjb25zdCBjb25maXJtZWRLY2FsID0gdHlwZW9mIGJvZHkuY29uZmlybWVkS2NhbCA9PT0gXCJudW1iZXJcIiA/IGJvZHkuY29uZmlybWVkS2NhbCA6IE51bWJlcihib2R5LmNvbmZpcm1lZEtjYWwpO1xuICBjb25zdCBjb25maXJtZWRQcm90ZWluID1cbiAgICB0eXBlb2YgYm9keS5jb25maXJtZWRQcm90ZWluID09PSBcIm51bWJlclwiID8gYm9keS5jb25maXJtZWRQcm90ZWluIDogTnVtYmVyKGJvZHkuY29uZmlybWVkUHJvdGVpbik7XG4gIGNvbnN0IGRpc2hOYW1lID0gdHlwZW9mIGJvZHkuZGlzaE5hbWUgPT09IFwic3RyaW5nXCIgPyBib2R5LmRpc2hOYW1lLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IG1lYWxUeXBlID0gdHlwZW9mIGJvZHkubWVhbFR5cGUgPT09IFwic3RyaW5nXCIgPyBib2R5Lm1lYWxUeXBlLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IHNhdmVUb0xpYnJhcnkgPSBib2R5LnNhdmVUb0xpYnJhcnkgPT09IHRydWU7XG4gIGlmICghZm9vZExvZ0lkIHx8ICFOdW1iZXIuaXNGaW5pdGUoY29uZmlybWVkS2NhbCkgfHwgIU51bWJlci5pc0Zpbml0ZShjb25maXJtZWRQcm90ZWluKSkge1xuICAgIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJFeHBlY3RlZCBmb29kTG9nSWQsIGNvbmZpcm1lZEtjYWwsIGNvbmZpcm1lZFByb3RlaW4uXCIgfSk7XG4gIH1cbiAgaWYgKCFkaXNoTmFtZSB8fCAhaXNNZWFsVHlwZShtZWFsVHlwZSkpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiRXhwZWN0ZWQgZGlzaE5hbWUgYW5kIHZhbGlkIG1lYWxUeXBlLlwiIH0pO1xuICB9XG5cbiAgY29uc3QgZXhpc3RpbmcgPSBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IGRlcHMuZm9vZExvZ1RhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0sIGZvb2RMb2dJZDogeyBTOiBmb29kTG9nSWQgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGlmICghZXhpc3RpbmcuSXRlbSkgcmV0dXJuIGpzb24oNDA0LCB7IGVycm9yOiBcIkZvb2QgbG9nIG5vdCBmb3VuZC5cIiB9KTtcbiAgY29uc3QgZGF5ID0gZXhpc3RpbmcuSXRlbS5kYXk/LlMgPz8gXCJcIjtcbiAgY29uc3QgaW1hZ2VLZXkgPSBleGlzdGluZy5JdGVtLmltYWdlS2V5Py5TID8/IFwiXCI7XG4gIGlmICghaXNEYXRlU3RyaW5nKGRheSkpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIGZvb2QgbG9nIGRheS5cIiB9KTtcblxuICBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IGRlcHMuZm9vZExvZ1RhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0sIGZvb2RMb2dJZDogeyBTOiBmb29kTG9nSWQgfSB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogXCJTRVQgY29uZmlybWVkS2NhbCA9IDprYywgY29uZmlybWVkUHJvdGVpbiA9IDpwciwgY29uZmlybWVkVHMgPSA6Y3RzXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgIFwiOmtjXCI6IHsgTjogU3RyaW5nKE1hdGgucm91bmQoY29uZmlybWVkS2NhbCkpIH0sXG4gICAgICAgIFwiOnByXCI6IHsgTjogU3RyaW5nKE1hdGgucm91bmQoY29uZmlybWVkUHJvdGVpbikpIH0sXG4gICAgICAgIFwiOmN0c1wiOiB7IFM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcblxuICBjb25zdCBkYXlLZXkgPSBgJHt1c2VySWR9IyR7ZGF5fWA7XG4gIGNvbnN0IGVudHJ5VXVpZCA9IHJhbmRvbVVVSUQoKTtcbiAgY29uc3QgZVNrID0gZW50cnlTayhlbnRyeVV1aWQpO1xuICBjb25zdCBsb2dnZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgY29uc3QgY2FyYnNHID0gYm9keS5jYXJic0cgIT09IHVuZGVmaW5lZCA/IE51bWJlcihib2R5LmNhcmJzRykgOiBOYU47XG4gIGNvbnN0IGZhdEcgPSBib2R5LmZhdEcgIT09IHVuZGVmaW5lZCA/IE51bWJlcihib2R5LmZhdEcpIDogTmFOO1xuXG4gIGxldCBsaWJyYXJ5TWVhbFNrOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGlmIChzYXZlVG9MaWJyYXJ5KSB7XG4gICAgY29uc3QgbmxLZXkgPSBuYW1lTG9va3VwS2V5KHVzZXJJZCwgZGlzaE5hbWUpO1xuICAgIGNvbnN0IHEgPSBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogZGVwcy5tZWFsc1RhYmxlTmFtZSxcbiAgICAgICAgSW5kZXhOYW1lOiBcIk5hbWVMb29rdXBLZXlJbmRleFwiLFxuICAgICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiBcIm5hbWVMb29rdXBLZXkgPSA6a1wiLFxuICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOmtcIjogeyBTOiBubEtleSB9IH0sXG4gICAgICAgIExpbWl0OiAxMCxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgbGV0IGZvdW5kOiBNZWFsUm93IHwgbnVsbCA9IG51bGw7XG4gICAgZm9yIChjb25zdCBpdCBvZiBxLkl0ZW1zID8/IFtdKSB7XG4gICAgICBjb25zdCBtID0gbWVhbEZyb21BdHRycyhpdCBhcyBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4pO1xuICAgICAgaWYgKG0gJiYgIW0uZGVsZXRlZEF0KSB7XG4gICAgICAgIGZvdW5kID0gbTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmb3VuZCkge1xuICAgICAgbGlicmFyeU1lYWxTayA9IG1lYWxTayhmb3VuZC5pZCk7XG4gICAgICBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgICAgICBuZXcgVXBkYXRlSXRlbUNvbW1hbmQoe1xuICAgICAgICAgIFRhYmxlTmFtZTogZGVwcy5tZWFsc1RhYmxlTmFtZSxcbiAgICAgICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9LCBtZWFsSWQ6IHsgUzogbGlicmFyeU1lYWxTayB9IH0sXG4gICAgICAgICAgVXBkYXRlRXhwcmVzc2lvbjpcbiAgICAgICAgICAgIFwiQUREIHRpbWVzTG9nZ2VkIDpvbmUgU0VUIGxhc3RMb2dnZWRBdCA9IDp0cywgdXBkYXRlZEF0ID0gOnRzLCBlc3RLY2FsID0gOmtjLCBlc3RQcm90ZWluRyA9IDpwZ1wiLFxuICAgICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgICAgIFwiOm9uZVwiOiB7IE46IFwiMVwiIH0sXG4gICAgICAgICAgICBcIjp0c1wiOiB7IFM6IGxvZ2dlZEF0IH0sXG4gICAgICAgICAgICBcIjprY1wiOiB7IE46IFN0cmluZyhNYXRoLnJvdW5kKGNvbmZpcm1lZEtjYWwpKSB9LFxuICAgICAgICAgICAgXCI6cGdcIjogeyBOOiBTdHJpbmcoTWF0aC5yb3VuZChOdW1iZXIoY29uZmlybWVkUHJvdGVpbikgKiAxMCkgLyAxMCkgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGlkID0gcmFuZG9tVVVJRCgpO1xuICAgICAgbGlicmFyeU1lYWxTayA9IG1lYWxTayhpZCk7XG4gICAgICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4gPSB7XG4gICAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgbWVhbElkOiB7IFM6IGxpYnJhcnlNZWFsU2sgfSxcbiAgICAgICAgbmFtZUxvb2t1cEtleTogeyBTOiBubEtleSB9LFxuICAgICAgICBuYW1lOiB7IFM6IGRpc2hOYW1lIH0sXG4gICAgICAgIG1lYWxUeXBlOiB7IFM6IG1lYWxUeXBlIH0sXG4gICAgICAgIGVzdEtjYWw6IG51bUF0dHIoTWF0aC5yb3VuZChjb25maXJtZWRLY2FsKSksXG4gICAgICAgIGVzdFByb3RlaW5HOiBudW1BdHRyKE1hdGgucm91bmQoTnVtYmVyKGNvbmZpcm1lZFByb3RlaW4pICogMTApIC8gMTApLFxuICAgICAgICBzb3VyY2U6IHsgUzogXCJwaG90b1wiIH0sXG4gICAgICAgIHRpbWVzTG9nZ2VkOiB7IE46IFwiMVwiIH0sXG4gICAgICAgIGxhc3RMb2dnZWRBdDogeyBTOiBsb2dnZWRBdCB9LFxuICAgICAgICBjcmVhdGVkQXQ6IHsgUzogbG9nZ2VkQXQgfSxcbiAgICAgICAgdXBkYXRlZEF0OiB7IFM6IGxvZ2dlZEF0IH0sXG4gICAgICB9O1xuICAgICAgaWYgKGltYWdlS2V5KSBpdGVtLnBob3RvS2V5ID0geyBTOiBpbWFnZUtleSB9O1xuICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShjYXJic0cpKSBpdGVtLmVzdENhcmJzRyA9IG51bUF0dHIoTWF0aC5yb3VuZChjYXJic0cgKiAxMCkgLyAxMCk7XG4gICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKGZhdEcpKSBpdGVtLmVzdEZhdEcgPSBudW1BdHRyKE1hdGgucm91bmQoZmF0RyAqIDEwKSAvIDEwKTtcbiAgICAgIGF3YWl0IGRlcHMuZGRiLnNlbmQobmV3IFB1dEl0ZW1Db21tYW5kKHsgVGFibGVOYW1lOiBkZXBzLm1lYWxzVGFibGVOYW1lLCBJdGVtOiBpdGVtIH0pKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBkYXlJdGVtOiBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4gPSB7XG4gICAgZGF5S2V5OiB7IFM6IGRheUtleSB9LFxuICAgIGVudHJ5SWQ6IHsgUzogZVNrIH0sXG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIGRheTogeyBTOiBkYXkgfSxcbiAgICBuYW1lU25hcHNob3Q6IHsgUzogZGlzaE5hbWUgfSxcbiAgICBtZWFsVHlwZTogeyBTOiBtZWFsVHlwZSB9LFxuICAgIGtjYWw6IG51bUF0dHIoTWF0aC5yb3VuZChjb25maXJtZWRLY2FsKSksXG4gICAgcHJvdGVpbkc6IG51bUF0dHIoTWF0aC5yb3VuZChOdW1iZXIoY29uZmlybWVkUHJvdGVpbikgKiAxMCkgLyAxMCksXG4gICAgbG9nZ2VkQXQ6IHsgUzogbG9nZ2VkQXQgfSxcbiAgfTtcbiAgaWYgKGltYWdlS2V5KSBkYXlJdGVtLnBob3RvS2V5ID0geyBTOiBpbWFnZUtleSB9O1xuICBpZiAoTnVtYmVyLmlzRmluaXRlKGNhcmJzRykpIGRheUl0ZW0uY2FyYnNHID0gbnVtQXR0cihNYXRoLnJvdW5kKGNhcmJzRyAqIDEwKSAvIDEwKTtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShmYXRHKSkgZGF5SXRlbS5mYXRHID0gbnVtQXR0cihNYXRoLnJvdW5kKGZhdEcgKiAxMCkgLyAxMCk7XG4gIGlmIChsaWJyYXJ5TWVhbFNrKSB7XG4gICAgZGF5SXRlbS5saWJyYXJ5TWVhbElkID0geyBTOiBsaWJyYXJ5TWVhbFNrIH07XG4gICAgZGF5SXRlbS5tZWFsSGlzdG9yeVNrID0geyBTOiBgJHtsb2dnZWRBdH0jJHtlU2t9YCB9O1xuICB9XG5cbiAgYXdhaXQgZGVwcy5kZGIuc2VuZChuZXcgUHV0SXRlbUNvbW1hbmQoeyBUYWJsZU5hbWU6IGRlcHMuZGF5TWVhbHNUYWJsZU5hbWUsIEl0ZW06IGRheUl0ZW0gfSkpO1xuICBjb25zdCBlbnRyeSA9IGRheUVudHJ5RnJvbUF0dHJzKGRheUl0ZW0gYXMgUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+LCBkYXkpO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUsIGVudHJ5LCBsaWJyYXJ5TWVhbElkOiBsaWJyYXJ5TWVhbFNrID8gc3RyaXBNZWFsUHJlZml4KGxpYnJhcnlNZWFsU2spIDogbnVsbCB9KTtcbn1cbiJdfQ==