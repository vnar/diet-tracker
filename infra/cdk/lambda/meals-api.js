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
    if (source !== "photo" && source !== "manual" && source !== "imported")
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
    if (it.notes?.S)
        row.notes = it.notes.S;
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
    const source = sourceRaw === "photo" || sourceRaw === "manual" || sourceRaw === "imported" ? sourceRaw : "manual";
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
    const cg = body.carbs_g !== undefined ? Number(body.carbs_g) : NaN;
    const fg = body.fat_g !== undefined ? Number(body.fat_g) : NaN;
    if (Number.isFinite(cg))
        item.carbsG = numAttr(Math.round(cg * 10) / 10);
    if (Number.isFinite(fg))
        item.fatG = numAttr(Math.round(fg * 10) / 10);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVhbHMtYXBpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibWVhbHMtYXBpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBK0xBLDhEQWlCQztBQUVELDhDQThCQztBQUVELGtEQWlFQztBQUVELGdEQTJFQztBQUVELGtEQW1CQztBQUVELG9EQXlDQztBQUVELGdFQXdCQztBQUVELG9FQWdHQztBQUVELGdFQXNCQztBQUVELDREQW1KQztBQXh1QkQsOERBS2tDO0FBQ2xDLDZDQUF5QztBQUN6Qyw4REFBa0U7QUFDbEUsOERBQThEO0FBQzlELDREQUF5RTtBQWF6RSxTQUFTLElBQUksQ0FBQyxVQUFrQixFQUFFLE9BQWdCO0lBQ2hELE9BQU87UUFDTCxVQUFVO1FBQ1YsT0FBTyxFQUFFLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFO1FBQy9DLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQztLQUM5QixDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLEtBQWdCO0lBQ3JDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSTtRQUFFLE9BQU8sRUFBRSxDQUFDO0lBQzNCLElBQUksQ0FBQztRQUNILE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUFDLE1BQU0sQ0FBQztRQUNQLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUM7QUFFRCxTQUFTLDBCQUEwQjtJQUNqQyxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxLQUFLLE1BQU0sQ0FBQztBQUNoRCxDQUFDO0FBRUQsU0FBUyxZQUFZLENBQUMsQ0FBUztJQUM3QixPQUFPLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBRUQsU0FBUyxNQUFNLENBQUMsSUFBWTtJQUMxQixPQUFPLFFBQVEsSUFBSSxFQUFFLENBQUM7QUFDeEIsQ0FB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LENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQ3pFLFFBQVE7S0FDVCxDQUFDO0lBQ0YsSUFBSSxFQUFFLENBQUMsYUFBYSxFQUFFLENBQUM7UUFBRSxHQUFHLENBQUMsTUFBTSxHQUFHLGVBQWUsQ0FBQyxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFFLElBQUksRUFBRSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQUUsR0FBRyxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUNqRCxJQUFJLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLElBQUksSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlELEdBQUcsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDekQsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxJQUFJLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxRCxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3JELElBQUksRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQUUsR0FBRyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN4QyxJQUFJLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUFFLEdBQUcsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxD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UUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDbkUsTUFBTSxRQUFRLEdBQUcsT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0lBQ2pGLE1BQU0sSUFBSSxHQUFHLE9BQU8sSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDM0UsTUFBTSxRQUFRLEdBQUcsT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM5RixNQUFNLFNBQVMsR0FBRyxPQUFPLElBQUksQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7SUFDbEYsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLElBQUEsc0JBQVUsRUFBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDM0YsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxFQUFFLDRDQUE0QyxFQUFFLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBQ0QsTUFBTSxNQUFNLEdBQ1YsU0FBUyxLQUFLLE9BQU8sSUFBSSxTQUFTLEtBQUssUUFBUSxJQUFJLFNBQVMsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLFNBQVMs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QUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDcEYsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztRQUFFLE9BQU8sQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzlFLElBQUksYUFBYSxFQUFFLENBQUM7UUFDbEIsT0FBTyxDQUFDLGFBQWEsR0FBRyxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQztRQUM3QyxPQUFPLENBQUMsYUFBYSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEdBQUcsUUFBUSxJQUFJLEdBQUcsRUFBRSxFQUFFLENBQUM7SUFDdEQsQ0FBQztJQUVELE1BQU0sSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzlGLE1BQU0sS0FBSyxHQUFHLGlCQUFpQixDQUFDLE9BQXlDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDaEYsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQzlHLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IEF0dHJpYnV0ZVZhbHVlLCBEeW5hbW9EQkNsaWVudCB9IGZyb20gXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIjtcbmltcG9ydCB7XG4gIEdldEl0ZW1Db21tYW5kLFxuICBQdXRJdGVtQ29tbWFuZCxcbiAgUXVlcnlDb21tYW5kLFxuICBVcGRhdGVJdGVtQ29tbWFuZCxcbn0gZnJvbSBcIkBhd3Mtc2RrL2NsaWVudC1keW5hbW9kYlwiO1xuaW1wb3J0IHsgcmFuZG9tVVVJRCB9IGZyb20gXCJub2RlOmNyeXB0b1wiO1xuaW1wb3J0IHsgdHJpZ3JhbVNpbWlsYXJpdHkgfSBmcm9tIFwiLi4vLi4vLi4vbGliL21lYWxzL2Z1enp5TWF0Y2hcIjtcbmltcG9ydCB7IG5hbWVMb29rdXBLZXkgfSBmcm9tIFwiLi4vLi4vLi4vbGliL21lYWxzL25hbWVMb29rdXBcIjtcbmltcG9ydCB7IGlzTWVhbFR5cGUsIHR5cGUgTWVhbFR5cGUgfSBmcm9tIFwiLi4vLi4vLi4vbGliL21lYWxzL21lYWxUeXBlc1wiO1xuXG5leHBvcnQgdHlwZSBIdHRwRXZlbnQgPSB7XG4gIGJvZHk/OiBzdHJpbmcgfCBudWxsO1xuICBxdWVyeVN0cmluZ1BhcmFtZXRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgbnVsbDtcbn07XG5cbmV4cG9ydCB0eXBlIEh0dHBSZXN1bHQgPSB7XG4gIHN0YXR1c0NvZGU6IG51bWJlcjtcbiAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIGJvZHk6IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIGpzb24oc3RhdHVzQ29kZTogbnVtYmVyLCBwYXlsb2FkOiB1bmtub3duKTogSHR0cFJlc3VsdCB7XG4gIHJldHVybiB7XG4gICAgc3RhdHVzQ29kZSxcbiAgICBoZWFkZXJzOiB7IFwiY29udGVudC10eXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHBhcnNlSnNvbkJvZHkoZXZlbnQ6IEh0dHBFdmVudCk6IHVua25vd24ge1xuICBpZiAoIWV2ZW50LmJvZHkpIHJldHVybiB7fTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNNZWFsTGlicmFyeUVuYWJsZWRMYW1iZGEoKTogYm9vbGVhbiB7XG4gIHJldHVybiBwcm9jZXNzLmVudi5GRl9NRUFMX0xJQlJBUlkgPT09IFwidHJ1ZVwiO1xufVxuXG5mdW5jdGlvbiBpc0RhdGVTdHJpbmcodjogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiAvXlxcZHs0fS1cXGR7Mn0tXFxkezJ9JC8udGVzdCh2KTtcbn1cblxuZnVuY3Rpb24gbWVhbFNrKHV1aWQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgTUVBTCMke3V1aWR9YDtcbn1cblxuZnVuY3Rpb24gZW50cnlTayh1dWlkOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYEVOVFJZIyR7dXVpZH1gO1xufVxuXG5mdW5jdGlvbiBzdHJpcE1lYWxQcmVmaXgoc2s6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBzay5zdGFydHNXaXRoKFwiTUVBTCNcIikgPyBzay5zbGljZSg1KSA6IHNrO1xufVxuXG5mdW5jdGlvbiBudW1BdHRyKG46IG51bWJlcik6IEF0dHJpYnV0ZVZhbHVlIHtcbiAgcmV0dXJuIHsgTjogU3RyaW5nKG4pIH07XG59XG5cbmZ1bmN0aW9uIHN0ckF0dHIoczogc3RyaW5nKTogQXR0cmlidXRlVmFsdWUge1xuICByZXR1cm4geyBTOiBzIH07XG59XG5cbnR5cGUgTWVhbFJvdyA9IHtcbiAgaWQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgbWVhbFR5cGU6IE1lYWxUeXBlO1xuICBwaG90b0tleT86IHN0cmluZztcbiAgZXN0S2NhbDogbnVtYmVyO1xuICBlc3RQcm90ZWluRzogbnVtYmVyO1xuICBlc3RDYXJic0c/OiBudW1iZXI7XG4gIGVzdEZhdEc/OiBudW1iZXI7XG4gIHNvdXJjZTogXCJwaG90b1wiIHwgXCJtYW51YWxcIiB8IFwiaW1wb3J0ZWRcIjtcbiAgdGltZXNMb2dnZWQ6IG51bWJlcjtcbiAgbGFzdExvZ2dlZEF0Pzogc3RyaW5nO1xuICBjcmVhdGVkQXQ6IHN0cmluZztcbiAgdXBkYXRlZEF0OiBzdHJpbmc7XG4gIGRlbGV0ZWRBdD86IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIG1lYWxGcm9tQXR0cnMoaXQ6IFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPik6IE1lYWxSb3cgfCBudWxsIHtcbiAgY29uc3QgdXNlcklkID0gaXQudXNlcklkPy5TO1xuICBjb25zdCBtZWFsSWQgPSBpdC5tZWFsSWQ/LlM7XG4gIGNvbnN0IG5hbWUgPSBpdC5uYW1lPy5TO1xuICBjb25zdCBtZWFsVHlwZSA9IGl0Lm1lYWxUeXBlPy5TO1xuICBjb25zdCBlc3RLY2FsID0gaXQuZXN0S2NhbD8uTiAhPSBudWxsID8gTnVtYmVyKGl0LmVzdEtjYWwuTikgOiBOYU47XG4gIGNvbnN0IGVzdFByb3RlaW5HID0gaXQuZXN0UHJvdGVpbkc/Lk4gIT0gbnVsbCA/IE51bWJlcihpdC5lc3RQcm90ZWluRy5OKSA6IE5hTjtcbiAgY29uc3Qgc291cmNlID0gaXQuc291cmNlPy5TO1xuICBjb25zdCB0aW1lc0xvZ2dlZCA9IGl0LnRpbWVzTG9nZ2VkPy5OICE9IG51bGwgPyBOdW1iZXIoaXQudGltZXNMb2dnZWQuTikgOiBOYU47XG4gIGNvbnN0IGNyZWF0ZWRBdCA9IGl0LmNyZWF0ZWRBdD8uUztcbiAgY29uc3QgdXBkYXRlZEF0ID0gaXQudXBkYXRlZEF0Py5TO1xuICBpZiAoIXVzZXJJZCB8fCAhbWVhbElkIHx8ICFuYW1lIHx8ICFtZWFsVHlwZSB8fCAhaXNNZWFsVHlwZShtZWFsVHlwZSkpIHJldHVybiBudWxsO1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShlc3RLY2FsKSB8fCAhTnVtYmVyLmlzRmluaXRlKGVzdFByb3RlaW5HKSB8fCAhTnVtYmVyLmlzRmluaXRlKHRpbWVzTG9nZ2VkKSlcbiAgICByZXR1cm4gbnVsbDtcbiAgaWYgKCFjcmVhdGVkQXQgfHwgIXVwZGF0ZWRBdCkgcmV0dXJuIG51bGw7XG4gIGlmIChzb3VyY2UgIT09IFwicGhvdG9cIiAmJiBzb3VyY2UgIT09IFwibWFudWFsXCIgJiYgc291cmNlICE9PSBcImltcG9ydGVkXCIpIHJldHVybiBudWxsO1xuICBjb25zdCByb3c6IE1lYWxSb3cgPSB7XG4gICAgaWQ6IHN0cmlwTWVhbFByZWZpeChtZWFsSWQpLFxuICAgIHVzZXJJZCxcbiAgICBuYW1lLFxuICAgIG1lYWxUeXBlLFxuICAgIGVzdEtjYWw6IE1hdGgucm91bmQoZXN0S2NhbCksXG4gICAgZXN0UHJvdGVpbkc6IE1hdGgucm91bmQoZXN0UHJvdGVpbkcgKiAxMCkgLyAxMCxcbiAgICBzb3VyY2UsXG4gICAgdGltZXNMb2dnZWQ6IE1hdGgucm91bmQodGltZXNMb2dnZWQpLFxuICAgIGNyZWF0ZWRBdCxcbiAgICB1cGRhdGVkQXQsXG4gIH07XG4gIGlmIChpdC5waG90b0tleT8uUykgcm93LnBob3RvS2V5ID0gaXQucGhvdG9LZXkuUztcbiAgaWYgKGl0LmVzdENhcmJzRz8uTiAhPSBudWxsICYmIE51bWJlci5pc0Zpbml0ZShOdW1iZXIoaXQuZXN0Q2FyYnNHLk4pKSlcbiAgICByb3cuZXN0Q2FyYnNHID0gTWF0aC5yb3VuZChOdW1iZXIoaXQuZXN0Q2FyYnNHLk4pICogMTApIC8gMTA7XG4gIGlmIChpdC5lc3RGYXRHPy5OICE9IG51bGwgJiYgTnVtYmVyLmlzRmluaXRlKE51bWJlcihpdC5lc3RGYXRHLk4pKSlcbiAgICByb3cuZXN0RmF0RyA9IE1hdGgucm91bmQoTnVtYmVyKGl0LmVzdEZhdEcuTikgKiAxMCkgLyAxMDtcbiAgaWYgKGl0Lmxhc3RMb2dnZWRBdD8uUykgcm93Lmxhc3RMb2dnZWRBdCA9IGl0Lmxhc3RMb2dnZWRBdC5TO1xuICBpZiAoaXQuZGVsZXRlZEF0Py5TKSByb3cuZGVsZXRlZEF0ID0gaXQuZGVsZXRlZEF0LlM7XG4gIHJldHVybiByb3c7XG59XG5cbnR5cGUgRGF5TWVhbFJvdyA9IHtcbiAgaWQ6IHN0cmluZztcbiAgZGF5OiBzdHJpbmc7XG4gIG1lYWxJZD86IHN0cmluZztcbiAgbmFtZVNuYXBzaG90OiBzdHJpbmc7XG4gIG1lYWxUeXBlOiBNZWFsVHlwZTtcbiAgcGhvdG9LZXk/OiBzdHJpbmc7XG4gIGtjYWw6IG51bWJlciB8IG51bGw7XG4gIHByb3RlaW5HOiBudW1iZXIgfCBudWxsO1xuICBjYXJic0c/OiBudW1iZXIgfCBudWxsO1xuICBmYXRHPzogbnVtYmVyIHwgbnVsbDtcbiAgbG9nZ2VkQXQ6IHN0cmluZztcbiAgbm90ZXM/OiBzdHJpbmc7XG4gIGRlbGV0ZWRBdD86IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIGRheUVudHJ5RnJvbUF0dHJzKGl0OiBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4sIGRheTogc3RyaW5nKTogRGF5TWVhbFJvdyB8IG51bGwge1xuICBjb25zdCBlbnRyeUlkID0gaXQuZW50cnlJZD8uUztcbiAgY29uc3QgbmFtZVNuYXBzaG90ID0gaXQubmFtZVNuYXBzaG90Py5TO1xuICBjb25zdCBtZWFsVHlwZSA9IGl0Lm1lYWxUeXBlPy5TO1xuICBjb25zdCBsb2dnZWRBdCA9IGl0LmxvZ2dlZEF0Py5TO1xuICBpZiAoIWVudHJ5SWQgfHwgIW5hbWVTbmFwc2hvdCB8fCAhbWVhbFR5cGUgfHwgIWlzTWVhbFR5cGUobWVhbFR5cGUpIHx8ICFsb2dnZWRBdCkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IGtjYWwgPSBpdC5rY2FsPy5OICE9IG51bGwgPyBNYXRoLnJvdW5kKE51bWJlcihpdC5rY2FsLk4pKSA6IG51bGw7XG4gIGNvbnN0IHByb3RlaW5HID0gaXQucHJvdGVpbkc/Lk4gIT0gbnVsbCA/IE1hdGgucm91bmQoTnVtYmVyKGl0LnByb3RlaW5HLk4pICogMTApIC8gMTAgOiBudWxsO1xuICBjb25zdCByb3c6IERheU1lYWxSb3cgPSB7XG4gICAgaWQ6IGVudHJ5SWQucmVwbGFjZSgvXkVOVFJZIy8sIFwiXCIpLFxuICAgIGRheSxcbiAgICBuYW1lU25hcHNob3QsXG4gICAgbWVhbFR5cGUsXG4gICAga2NhbDogTnVtYmVyLmlzRmluaXRlKGtjYWwgYXMgbnVtYmVyKSA/IGtjYWwgOiBudWxsLFxuICAgIHByb3RlaW5HOiBwcm90ZWluRyAhPSBudWxsICYmIE51bWJlci5pc0Zpbml0ZShwcm90ZWluRykgPyBwcm90ZWluRyA6IG51bGwsXG4gICAgbG9nZ2VkQXQsXG4gIH07XG4gIGlmIChpdC5saWJyYXJ5TWVhbElkPy5TKSByb3cubWVhbElkID0gc3RyaXBNZWFsUHJlZml4KGl0LmxpYnJhcnlNZWFsSWQuUyk7XG4gIGlmIChpdC5waG90b0tleT8uUykgcm93LnBob3RvS2V5ID0gaXQucGhvdG9LZXkuUztcbiAgaWYgKGl0LmNhcmJzRz8uTiAhPSBudWxsICYmIE51bWJlci5pc0Zpbml0ZShOdW1iZXIoaXQuY2FyYnNHLk4pKSlcbiAgICByb3cuY2FyYnNHID0gTWF0aC5yb3VuZChOdW1iZXIoaXQuY2FyYnNHLk4pICogMTApIC8gMTA7XG4gIGlmIChpdC5mYXRHPy5OICE9IG51bGwgJiYgTnVtYmVyLmlzRmluaXRlKE51bWJlcihpdC5mYXRHLk4pKSlcbiAgICByb3cuZmF0RyA9IE1hdGgucm91bmQoTnVtYmVyKGl0LmZhdEcuTikgKiAxMCkgLyAxMDtcbiAgaWYgKGl0Lm5vdGVzPy5TKSByb3cubm90ZXMgPSBpdC5ub3Rlcy5TO1xuICBpZiAoaXQuZGVsZXRlZEF0Py5TKSByb3cuZGVsZXRlZEF0ID0gaXQuZGVsZXRlZEF0LlM7XG4gIHJldHVybiByb3c7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHF1ZXJ5QWxsTWVhbHNGb3JVc2VyKFxuICBkZGI6IER5bmFtb0RCQ2xpZW50LFxuICB0YWJsZTogc3RyaW5nLFxuICB1c2VySWQ6IHN0cmluZyxcbik6IFByb21pc2U8TWVhbFJvd1tdPiB7XG4gIGNvbnN0IG91dCA9IGF3YWl0IGRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0YWJsZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwidXNlcklkID0gOnUgQU5EIGJlZ2luc193aXRoKG1lYWxJZCwgOnApXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgIFwiOnVcIjogeyBTOiB1c2VySWQgfSxcbiAgICAgICAgXCI6cFwiOiB7IFM6IFwiTUVBTCNcIiB9LFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3Qgcm93czogTWVhbFJvd1tdID0gW107XG4gIGZvciAoY29uc3QgaXQgb2Ygb3V0Lkl0ZW1zID8/IFtdKSB7XG4gICAgY29uc3QgbSA9IG1lYWxGcm9tQXR0cnMoaXQgYXMgUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+KTtcbiAgICBpZiAobSAmJiAhbS5kZWxldGVkQXQpIHJvd3MucHVzaChtKTtcbiAgfVxuICByZXR1cm4gcm93cztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVYyTWVhbHNTdWdnZXN0TWF0Y2goXG4gIHVzZXJJZDogc3RyaW5nLFxuICBldmVudDogSHR0cEV2ZW50LFxuICBkZXBzOiB7IGRkYjogRHluYW1vREJDbGllbnQ7IG1lYWxzVGFibGVOYW1lOiBzdHJpbmcgfSxcbik6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBpZiAoIWlzTWVhbExpYnJhcnlFbmFibGVkTGFtYmRhKCkpIHtcbiAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiTWVhbCBsaWJyYXJ5IGlzIGRpc2FibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IHEgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LnF1ZXJ5Py50cmltKCkgPz8gXCJcIjtcbiAgaWYgKCFxKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiTWlzc2luZyBxdWVyeSBwYXJhbWV0ZXI6IHF1ZXJ5XCIgfSk7XG4gIGNvbnN0IG1lYWxzID0gYXdhaXQgcXVlcnlBbGxNZWFsc0ZvclVzZXIoZGVwcy5kZGIsIGRlcHMubWVhbHNUYWJsZU5hbWUsIHVzZXJJZCk7XG4gIGxldCBiZXN0OiB7IG1lYWw6IE1lYWxSb3c7IHNjb3JlOiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuICBmb3IgKGNvbnN0IG0gb2YgbWVhbHMpIHtcbiAgICBjb25zdCBzY29yZSA9IHRyaWdyYW1TaW1pbGFyaXR5KHEsIG0ubmFtZSk7XG4gICAgaWYgKHNjb3JlID49IDAuNiAmJiAoIWJlc3QgfHwgc2NvcmUgPiBiZXN0LnNjb3JlKSkgYmVzdCA9IHsgbWVhbDogbSwgc2NvcmUgfTtcbiAgfVxuICByZXR1cm4ganNvbigyMDAsIHsgbWF0Y2g6IGJlc3Q/Lm1lYWwgPz8gbnVsbCwgc2ltaWxhcml0eTogYmVzdD8uc2NvcmUgPz8gMCB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVYyTWVhbHNMaXN0KFxuICB1c2VySWQ6IHN0cmluZyxcbiAgZXZlbnQ6IEh0dHBFdmVudCxcbiAgZGVwczogeyBkZGI6IER5bmFtb0RCQ2xpZW50OyBtZWFsc1RhYmxlTmFtZTogc3RyaW5nIH0sXG4pOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgaWYgKCFpc01lYWxMaWJyYXJ5RW5hYmxlZExhbWJkYSgpKSB7XG4gICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBpcyBkaXNhYmxlZC5cIiB9KTtcbiAgfVxuICBjb25zdCB0eXBlRmlsdGVyID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy50eXBlPy50cmltKCk7XG4gIGNvbnN0IHEgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LnE/LnRyaW0oKS50b0xvd2VyQ2FzZSgpID8/IFwiXCI7XG4gIGNvbnN0IHNvcnQgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LnNvcnQ/LnRyaW0oKSA/PyBcInJlY2VudFwiO1xuICBjb25zdCBsaW1pdFJhdyA9IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8ubGltaXQ7XG4gIGNvbnN0IGxpbWl0ID0gTWF0aC5taW4oMTAwLCBNYXRoLm1heCgxLCBOdW1iZXIobGltaXRSYXcpIHx8IDUwKSk7XG5cbiAgbGV0IG1lYWxzID0gYXdhaXQgcXVlcnlBbGxNZWFsc0ZvclVzZXIoZGVwcy5kZGIsIGRlcHMubWVhbHNUYWJsZU5hbWUsIHVzZXJJZCk7XG4gIGlmICh0eXBlRmlsdGVyICYmIGlzTWVhbFR5cGUodHlwZUZpbHRlcikpIHtcbiAgICBtZWFscyA9IG1lYWxzLmZpbHRlcigobSkgPT4gbS5tZWFsVHlwZSA9PT0gdHlwZUZpbHRlcik7XG4gIH1cbiAgaWYgKHEpIHtcbiAgICBtZWFscyA9IG1lYWxzLmZpbHRlcigobSkgPT4gbS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocSkpO1xuICB9XG4gIGlmIChzb3J0ID09PSBcImZyZXF1ZW50XCIpIHtcbiAgICBtZWFscy5zb3J0KChhLCBiKSA9PiBiLnRpbWVzTG9nZ2VkIC0gYS50aW1lc0xvZ2dlZCB8fCAoYi5sYXN0TG9nZ2VkQXQgPz8gXCJcIikubG9jYWxlQ29tcGFyZShhLmxhc3RMb2dnZWRBdCA/PyBcIlwiKSk7XG4gIH0gZWxzZSBpZiAoc29ydCA9PT0gXCJhbHBoYVwiKSB7XG4gICAgbWVhbHMuc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSk7XG4gIH0gZWxzZSB7XG4gICAgbWVhbHMuc29ydCgoYSwgYikgPT4gKGIubGFzdExvZ2dlZEF0ID8/IGIuY3JlYXRlZEF0KS5sb2NhbGVDb21wYXJlKGEubGFzdExvZ2dlZEF0ID8/IGEuY3JlYXRlZEF0KSk7XG4gIH1cbiAgY29uc3Qgc2xpY2UgPSBtZWFscy5zbGljZSgwLCBsaW1pdCk7XG4gIHJldHVybiBqc29uKDIwMCwgeyBpdGVtczogc2xpY2UsIG5leHRUb2tlbjogdW5kZWZpbmVkIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlVjJNZWFsc0NyZWF0ZShcbiAgdXNlcklkOiBzdHJpbmcsXG4gIGV2ZW50OiBIdHRwRXZlbnQsXG4gIGRlcHM6IHsgZGRiOiBEeW5hbW9EQkNsaWVudDsgbWVhbHNUYWJsZU5hbWU6IHN0cmluZyB9LFxuKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGlmICghaXNNZWFsTGlicmFyeUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgaXMgZGlzYWJsZWQuXCIgfSk7XG4gIH1cbiAgY29uc3QgcmF3ID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmIChyYXcgPT09IG51bGwpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIEpTT05cIiB9KTtcbiAgY29uc3QgYm9keSA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgbmFtZSA9IHR5cGVvZiBib2R5Lm5hbWUgPT09IFwic3RyaW5nXCIgPyBib2R5Lm5hbWUudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgbWVhbFR5cGUgPSB0eXBlb2YgYm9keS5tZWFsX3R5cGUgPT09IFwic3RyaW5nXCIgPyBib2R5Lm1lYWxfdHlwZS50cmltKCkgOiBcIlwiO1xuICBjb25zdCBrY2FsID0gdHlwZW9mIGJvZHkua2NhbCA9PT0gXCJudW1iZXJcIiA/IGJvZHkua2NhbCA6IE51bWJlcihib2R5LmtjYWwpO1xuICBjb25zdCBwcm90ZWluRyA9IHR5cGVvZiBib2R5LnByb3RlaW5fZyA9PT0gXCJudW1iZXJcIiA/IGJvZHkucHJvdGVpbl9nIDogTnVtYmVyKGJvZHkucHJvdGVpbl9nKTtcbiAgY29uc3Qgc291cmNlUmF3ID0gdHlwZW9mIGJvZHkuc291cmNlID09PSBcInN0cmluZ1wiID8gYm9keS5zb3VyY2UudHJpbSgpIDogXCJtYW51YWxcIjtcbiAgaWYgKCFuYW1lIHx8ICFpc01lYWxUeXBlKG1lYWxUeXBlKSB8fCAhTnVtYmVyLmlzRmluaXRlKGtjYWwpIHx8ICFOdW1iZXIuaXNGaW5pdGUocHJvdGVpbkcpKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkV4cGVjdGVkIG5hbWUsIG1lYWxfdHlwZSwga2NhbCwgcHJvdGVpbl9nLlwiIH0pO1xuICB9XG4gIGNvbnN0IHNvdXJjZSA9XG4gICAgc291cmNlUmF3ID09PSBcInBob3RvXCIgfHwgc291cmNlUmF3ID09PSBcIm1hbnVhbFwiIHx8IHNvdXJjZVJhdyA9PT0gXCJpbXBvcnRlZFwiID8gc291cmNlUmF3IDogXCJtYW51YWxcIjtcbiAgY29uc3QgbmxLZXkgPSBuYW1lTG9va3VwS2V5KHVzZXJJZCwgbmFtZSk7XG4gIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgZGVwcy5kZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogZGVwcy5tZWFsc1RhYmxlTmFtZSxcbiAgICAgIEluZGV4TmFtZTogXCJOYW1lTG9va3VwS2V5SW5kZXhcIixcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwibmFtZUxvb2t1cEtleSA9IDprXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOmtcIjogeyBTOiBubEtleSB9IH0sXG4gICAgICBMaW1pdDogNSxcbiAgICB9KSxcbiAgKTtcbiAgZm9yIChjb25zdCBpdCBvZiBleGlzdGluZy5JdGVtcyA/PyBbXSkge1xuICAgIGNvbnN0IG0gPSBtZWFsRnJvbUF0dHJzKGl0IGFzIFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPik7XG4gICAgaWYgKG0gJiYgIW0uZGVsZXRlZEF0KSByZXR1cm4ganNvbigyMDAsIHsgbWVhbDogbSwgY3JlYXRlZDogZmFsc2UgfSk7XG4gIH1cblxuICBjb25zdCBpZCA9IHJhbmRvbVVVSUQoKTtcbiAgY29uc3Qgc2sgPSBtZWFsU2soaWQpO1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGNvbnN0IHBob3RvS2V5ID0gdHlwZW9mIGJvZHkucGhvdG9fa2V5ID09PSBcInN0cmluZ1wiID8gYm9keS5waG90b19rZXkudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgY2FyYnNHID1cbiAgICBib2R5LmNhcmJzX2cgIT09IHVuZGVmaW5lZCA/ICh0eXBlb2YgYm9keS5jYXJic19nID09PSBcIm51bWJlclwiID8gYm9keS5jYXJic19nIDogTnVtYmVyKGJvZHkuY2FyYnNfZykpIDogdW5kZWZpbmVkO1xuICBjb25zdCBmYXRHID1cbiAgICBib2R5LmZhdF9nICE9PSB1bmRlZmluZWQgPyAodHlwZW9mIGJvZHkuZmF0X2cgPT09IFwibnVtYmVyXCIgPyBib2R5LmZhdF9nIDogTnVtYmVyKGJvZHkuZmF0X2cpKSA6IHVuZGVmaW5lZDtcblxuICBjb25zdCBpdGVtOiBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4gPSB7XG4gICAgdXNlcklkOiB7IFM6IHVzZXJJZCB9LFxuICAgIG1lYWxJZDogeyBTOiBzayB9LFxuICAgIG5hbWVMb29rdXBLZXk6IHsgUzogbmxLZXkgfSxcbiAgICBuYW1lOiB7IFM6IG5hbWUgfSxcbiAgICBtZWFsVHlwZTogeyBTOiBtZWFsVHlwZSB9LFxuICAgIGVzdEtjYWw6IG51bUF0dHIoTWF0aC5yb3VuZChrY2FsKSksXG4gICAgZXN0UHJvdGVpbkc6IG51bUF0dHIoTWF0aC5yb3VuZChwcm90ZWluRyAqIDEwKSAvIDEwKSxcbiAgICBzb3VyY2U6IHsgUzogc291cmNlIH0sXG4gICAgdGltZXNMb2dnZWQ6IHsgTjogXCIwXCIgfSxcbiAgICBjcmVhdGVkQXQ6IHsgUzogbm93IH0sXG4gICAgdXBkYXRlZEF0OiB7IFM6IG5vdyB9LFxuICB9O1xuICBpZiAocGhvdG9LZXkpIGl0ZW0ucGhvdG9LZXkgPSB7IFM6IHBob3RvS2V5IH07XG4gIGlmIChjYXJic0cgIT09IHVuZGVmaW5lZCAmJiBOdW1iZXIuaXNGaW5pdGUoY2FyYnNHKSkgaXRlbS5lc3RDYXJic0cgPSBudW1BdHRyKE1hdGgucm91bmQoY2FyYnNHICogMTApIC8gMTApO1xuICBpZiAoZmF0RyAhPT0gdW5kZWZpbmVkICYmIE51bWJlci5pc0Zpbml0ZShmYXRHKSkgaXRlbS5lc3RGYXRHID0gbnVtQXR0cihNYXRoLnJvdW5kKGZhdEcgKiAxMCkgLyAxMCk7XG5cbiAgYXdhaXQgZGVwcy5kZGIuc2VuZChuZXcgUHV0SXRlbUNvbW1hbmQoeyBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsIEl0ZW06IGl0ZW0gfSkpO1xuICBjb25zdCBtID0gbWVhbEZyb21BdHRycyhpdGVtIGFzIFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPik7XG4gIHJldHVybiBqc29uKDIwMSwgeyBtZWFsOiBtLCBjcmVhdGVkOiB0cnVlIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlVjJNZWFsc1BhdGNoKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgbWVhbElkUGFyYW06IHN0cmluZyxcbiAgZXZlbnQ6IEh0dHBFdmVudCxcbiAgZGVwczogeyBkZGI6IER5bmFtb0RCQ2xpZW50OyBtZWFsc1RhYmxlTmFtZTogc3RyaW5nIH0sXG4pOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgaWYgKCFpc01lYWxMaWJyYXJ5RW5hYmxlZExhbWJkYSgpKSB7XG4gICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBpcyBkaXNhYmxlZC5cIiB9KTtcbiAgfVxuICBjb25zdCBzayA9IG1lYWxTayhtZWFsSWRQYXJhbSk7XG4gIGNvbnN0IGdvdCA9IGF3YWl0IGRlcHMuZGRiLnNlbmQoXG4gICAgbmV3IEdldEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogZGVwcy5tZWFsc1RhYmxlTmFtZSxcbiAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0sIG1lYWxJZDogeyBTOiBzayB9IH0sXG4gICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICB9KSxcbiAgKTtcbiAgaWYgKCFnb3QuSXRlbSkgcmV0dXJuIGpzb24oNDA0LCB7IGVycm9yOiBcIk1lYWwgbm90IGZvdW5kLlwiIH0pO1xuICBjb25zdCBjdXIgPSBtZWFsRnJvbUF0dHJzKGdvdC5JdGVtIGFzIFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPik7XG4gIGlmICghY3VyIHx8IGN1ci5kZWxldGVkQXQpIHJldHVybiBqc29uKDQwNCwgeyBlcnJvcjogXCJNZWFsIG5vdCBmb3VuZC5cIiB9KTtcblxuICBjb25zdCByYXcgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKHJhdyA9PT0gbnVsbCkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICBjb25zdCBib2R5ID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBuYW1lID0gdHlwZW9mIGJvZHkubmFtZSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubmFtZS50cmltKCkgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IG1lYWxUeXBlID0gdHlwZW9mIGJvZHkubWVhbF90eXBlID09PSBcInN0cmluZ1wiID8gYm9keS5tZWFsX3R5cGUudHJpbSgpIDogdW5kZWZpbmVkO1xuICBpZiAobWVhbFR5cGUgIT09IHVuZGVmaW5lZCAmJiAhaXNNZWFsVHlwZShtZWFsVHlwZSkpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBtZWFsX3R5cGUuXCIgfSk7XG4gIH1cbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBjb25zdCBleHByTmFtZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgY29uc3QgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4gPSB7IFwiOnVcIjogeyBTOiBub3cgfSB9O1xuICBsZXQgZXhwciA9IFwiU0VUIHVwZGF0ZWRBdCA9IDp1XCI7XG4gIGlmIChuYW1lICE9PSB1bmRlZmluZWQpIHtcbiAgICBleHByICs9IFwiLCAjbiA9IDpuYW1lLCBuYW1lTG9va3VwS2V5ID0gOm5sa1wiO1xuICAgIGV4cHJOYW1lc1tcIiNuXCJdID0gXCJuYW1lXCI7XG4gICAgdmFsdWVzW1wiOm5hbWVcIl0gPSB7IFM6IG5hbWUgfTtcbiAgICB2YWx1ZXNbXCI6bmxrXCJdID0geyBTOiBuYW1lTG9va3VwS2V5KHVzZXJJZCwgbmFtZSkgfTtcbiAgfVxuICBpZiAobWVhbFR5cGUgIT09IHVuZGVmaW5lZCkge1xuICAgIGV4cHIgKz0gXCIsIG1lYWxUeXBlID0gOm10XCI7XG4gICAgdmFsdWVzW1wiOm10XCJdID0geyBTOiBtZWFsVHlwZSB9O1xuICB9XG4gIGlmIChib2R5LmVzdF9rY2FsICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBrID0gdHlwZW9mIGJvZHkuZXN0X2tjYWwgPT09IFwibnVtYmVyXCIgPyBib2R5LmVzdF9rY2FsIDogTnVtYmVyKGJvZHkuZXN0X2tjYWwpO1xuICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoaykpIHtcbiAgICAgIGV4cHIgKz0gXCIsIGVzdEtjYWwgPSA6a2NcIjtcbiAgICAgIHZhbHVlc1tcIjprY1wiXSA9IG51bUF0dHIoTWF0aC5yb3VuZChrKSk7XG4gICAgfVxuICB9XG4gIGlmIChib2R5LmVzdF9wcm90ZWluX2cgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IHAgPSB0eXBlb2YgYm9keS5lc3RfcHJvdGVpbl9nID09PSBcIm51bWJlclwiID8gYm9keS5lc3RfcHJvdGVpbl9nIDogTnVtYmVyKGJvZHkuZXN0X3Byb3RlaW5fZyk7XG4gICAgaWYgKE51bWJlci5pc0Zpbml0ZShwKSkge1xuICAgICAgZXhwciArPSBcIiwgZXN0UHJvdGVpbkcgPSA6cGdcIjtcbiAgICAgIHZhbHVlc1tcIjpwZ1wiXSA9IG51bUF0dHIoTWF0aC5yb3VuZChwICogMTApIC8gMTApO1xuICAgIH1cbiAgfVxuICBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9LCBtZWFsSWQ6IHsgUzogc2sgfSB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogZXhwcixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHZhbHVlcyxcbiAgICAgIC4uLihPYmplY3Qua2V5cyhleHByTmFtZXMpLmxlbmd0aCA/IHsgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiBleHByTmFtZXMgfSA6IHt9KSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgYWdhaW4gPSBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgIG5ldyBHZXRJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9LCBtZWFsSWQ6IHsgUzogc2sgfSB9LFxuICAgICAgQ29uc2lzdGVudFJlYWQ6IHRydWUsXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IG0gPSBtZWFsRnJvbUF0dHJzKChhZ2Fpbi5JdGVtID8/IHt9KSBhcyBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4pO1xuICByZXR1cm4ganNvbigyMDAsIHsgbWVhbDogbSB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZVYyTWVhbHNEZWxldGUoXG4gIHVzZXJJZDogc3RyaW5nLFxuICBtZWFsSWRQYXJhbTogc3RyaW5nLFxuICBkZXBzOiB7IGRkYjogRHluYW1vREJDbGllbnQ7IG1lYWxzVGFibGVOYW1lOiBzdHJpbmcgfSxcbik6IFByb21pc2U8SHR0cFJlc3VsdD4ge1xuICBpZiAoIWlzTWVhbExpYnJhcnlFbmFibGVkTGFtYmRhKCkpIHtcbiAgICByZXR1cm4ganNvbig0MDMsIHsgZXJyb3I6IFwiTWVhbCBsaWJyYXJ5IGlzIGRpc2FibGVkLlwiIH0pO1xuICB9XG4gIGNvbnN0IHNrID0gbWVhbFNrKG1lYWxJZFBhcmFtKTtcbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgIG5ldyBVcGRhdGVJdGVtQ29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9LCBtZWFsSWQ6IHsgUzogc2sgfSB9LFxuICAgICAgVXBkYXRlRXhwcmVzc2lvbjogXCJTRVQgZGVsZXRlZEF0ID0gOmQsIHVwZGF0ZWRBdCA9IDpkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOmRcIjogeyBTOiBub3cgfSB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVWMk1lYWxzSGlzdG9yeShcbiAgdXNlcklkOiBzdHJpbmcsXG4gIG1lYWxJZFBhcmFtOiBzdHJpbmcsXG4gIGRlcHM6IHsgZGRiOiBEeW5hbW9EQkNsaWVudDsgZGF5TWVhbHNUYWJsZU5hbWU6IHN0cmluZyB9LFxuKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGlmICghaXNNZWFsTGlicmFyeUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgaXMgZGlzYWJsZWQuXCIgfSk7XG4gIH1cbiAgY29uc3QgbGliU2sgPSBtZWFsU2sobWVhbElkUGFyYW0pO1xuICBjb25zdCBvdXQgPSBhd2FpdCBkZXBzLmRkYi5zZW5kKFxuICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBkZXBzLmRheU1lYWxzVGFibGVOYW1lLFxuICAgICAgSW5kZXhOYW1lOiBcIk1lYWxIaXN0b3J5SW5kZXhcIixcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwibGlicmFyeU1lYWxJZCA9IDptXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOm1cIjogeyBTOiBsaWJTayB9IH0sXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IHJvd3M6IEFycmF5PHtcbiAgICBkYXk6IHN0cmluZztcbiAgICBuYW1lU25hcHNob3Q6IHN0cmluZztcbiAgICBrY2FsOiBudW1iZXIgfCBudWxsO1xuICAgIHByb3RlaW5HOiBudW1iZXIgfCBudWxsO1xuICAgIGxvZ2dlZEF0OiBzdHJpbmc7XG4gICAgbm90ZXM/OiBzdHJpbmc7XG4gIH0+ID0gW107XG4gIGZvciAoY29uc3QgaXQgb2Ygb3V0Lkl0ZW1zID8/IFtdKSB7XG4gICAgY29uc3QgZGF5ID0gaXQuZGF5Py5TO1xuICAgIGlmICghZGF5KSBjb250aW51ZTtcbiAgICBjb25zdCBlID0gZGF5RW50cnlGcm9tQXR0cnMoaXQgYXMgUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+LCBkYXkpO1xuICAgIGlmICghZSB8fCBlLmRlbGV0ZWRBdCkgY29udGludWU7XG4gICAgcm93cy5wdXNoKHtcbiAgICAgIGRheTogZS5kYXksXG4gICAgICBuYW1lU25hcHNob3Q6IGUubmFtZVNuYXBzaG90LFxuICAgICAga2NhbDogZS5rY2FsLFxuICAgICAgcHJvdGVpbkc6IGUucHJvdGVpbkcsXG4gICAgICBsb2dnZWRBdDogZS5sb2dnZWRBdCxcbiAgICAgIG5vdGVzOiBlLm5vdGVzLFxuICAgIH0pO1xuICB9XG4gIHJvd3Muc29ydCgoYSwgYikgPT4gYS5sb2dnZWRBdC5sb2NhbGVDb21wYXJlKGIubG9nZ2VkQXQpKTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IGl0ZW1zOiByb3dzIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlVjJEYXlNZWFsRW50cmllc0xpc3QoXG4gIHVzZXJJZDogc3RyaW5nLFxuICBkYXk6IHN0cmluZyxcbiAgZGVwczogeyBkZGI6IER5bmFtb0RCQ2xpZW50OyBkYXlNZWFsc1RhYmxlTmFtZTogc3RyaW5nIH0sXG4pOiBQcm9taXNlPEh0dHBSZXN1bHQ+IHtcbiAgaWYgKCFpc01lYWxMaWJyYXJ5RW5hYmxlZExhbWJkYSgpKSB7XG4gICAgcmV0dXJuIGpzb24oNDAzLCB7IGVycm9yOiBcIk1lYWwgbGlicmFyeSBpcyBkaXNhYmxlZC5cIiB9KTtcbiAgfVxuICBpZiAoIWlzRGF0ZVN0cmluZyhkYXkpKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBkYXkuXCIgfSk7XG4gIGNvbnN0IGRheUtleSA9IGAke3VzZXJJZH0jJHtkYXl9YDtcbiAgY29uc3Qgb3V0ID0gYXdhaXQgZGVwcy5kZGIuc2VuZChcbiAgICBuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogZGVwcy5kYXlNZWFsc1RhYmxlTmFtZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246IFwiZGF5S2V5ID0gOmRcIixcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHsgXCI6ZFwiOiB7IFM6IGRheUtleSB9IH0sXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IGl0ZW1zOiBEYXlNZWFsUm93W10gPSBbXTtcbiAgZm9yIChjb25zdCBpdCBvZiBvdXQuSXRlbXMgPz8gW10pIHtcbiAgICBjb25zdCBlID0gZGF5RW50cnlGcm9tQXR0cnMoaXQgYXMgUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+LCBkYXkpO1xuICAgIGlmIChlICYmICFlLmRlbGV0ZWRBdCkgaXRlbXMucHVzaChlKTtcbiAgfVxuICBpdGVtcy5zb3J0KChhLCBiKSA9PiBiLmxvZ2dlZEF0LmxvY2FsZUNvbXBhcmUoYS5sb2dnZWRBdCkpO1xuICByZXR1cm4ganNvbigyMDAsIHsgaXRlbXMgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVWMkRheU1lYWxFbnRyaWVzQ3JlYXRlKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgZGF5OiBzdHJpbmcsXG4gIGV2ZW50OiBIdHRwRXZlbnQsXG4gIGRlcHM6IHsgZGRiOiBEeW5hbW9EQkNsaWVudDsgZGF5TWVhbHNUYWJsZU5hbWU6IHN0cmluZzsgbWVhbHNUYWJsZU5hbWU6IHN0cmluZyB9LFxuKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGlmICghaXNNZWFsTGlicmFyeUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgaXMgZGlzYWJsZWQuXCIgfSk7XG4gIH1cbiAgaWYgKCFpc0RhdGVTdHJpbmcoZGF5KSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgZGF5LlwiIH0pO1xuICBjb25zdCByYXcgPSBwYXJzZUpzb25Cb2R5KGV2ZW50KTtcbiAgaWYgKHJhdyA9PT0gbnVsbCkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgSlNPTlwiIH0pO1xuICBjb25zdCBib2R5ID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBjb25zdCBtZWFsSWRCb2R5ID0gdHlwZW9mIGJvZHkubWVhbF9pZCA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubWVhbF9pZC50cmltKCkgOiBcIlwiO1xuXG4gIGNvbnN0IGRheUtleSA9IGAke3VzZXJJZH0jJHtkYXl9YDtcbiAgY29uc3QgZW50cnlVdWlkID0gcmFuZG9tVVVJRCgpO1xuICBjb25zdCBlU2sgPSBlbnRyeVNrKGVudHJ5VXVpZCk7XG4gIGNvbnN0IGxvZ2dlZEF0ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuXG4gIGlmIChtZWFsSWRCb2R5KSB7XG4gICAgY29uc3QgbVNrID0gbWVhbFNrKG1lYWxJZEJvZHkpO1xuICAgIGNvbnN0IGdvdCA9IGF3YWl0IGRlcHMuZGRiLnNlbmQoXG4gICAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0sIG1lYWxJZDogeyBTOiBtU2sgfSB9LFxuICAgICAgICBDb25zaXN0ZW50UmVhZDogdHJ1ZSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgY29uc3QgbWVhbCA9IG1lYWxGcm9tQXR0cnMoKGdvdC5JdGVtID8/IHt9KSBhcyBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4pO1xuICAgIGlmICghbWVhbCB8fCBtZWFsLmRlbGV0ZWRBdCkgcmV0dXJuIGpzb24oNDA0LCB7IGVycm9yOiBcIk1lYWwgbm90IGZvdW5kLlwiIH0pO1xuXG4gICAgY29uc3QgaXRlbTogUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+ID0ge1xuICAgICAgZGF5S2V5OiB7IFM6IGRheUtleSB9LFxuICAgICAgZW50cnlJZDogeyBTOiBlU2sgfSxcbiAgICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICAgIGRheTogeyBTOiBkYXkgfSxcbiAgICAgIG5hbWVTbmFwc2hvdDogeyBTOiBtZWFsLm5hbWUgfSxcbiAgICAgIG1lYWxUeXBlOiB7IFM6IG1lYWwubWVhbFR5cGUgfSxcbiAgICAgIGtjYWw6IG51bUF0dHIobWVhbC5lc3RLY2FsKSxcbiAgICAgIHByb3RlaW5HOiBudW1BdHRyKG1lYWwuZXN0UHJvdGVpbkcpLFxuICAgICAgbG9nZ2VkQXQ6IHsgUzogbG9nZ2VkQXQgfSxcbiAgICAgIGxpYnJhcnlNZWFsSWQ6IHsgUzogbVNrIH0sXG4gICAgICBtZWFsSGlzdG9yeVNrOiB7IFM6IGAke2xvZ2dlZEF0fSMke2VTa31gIH0sXG4gICAgfTtcbiAgICBpZiAobWVhbC5waG90b0tleSkgaXRlbS5waG90b0tleSA9IHsgUzogbWVhbC5waG90b0tleSB9O1xuICAgIGlmIChtZWFsLmVzdENhcmJzRyAhPSBudWxsKSBpdGVtLmNhcmJzRyA9IG51bUF0dHIobWVhbC5lc3RDYXJic0cpO1xuICAgIGlmIChtZWFsLmVzdEZhdEcgIT0gbnVsbCkgaXRlbS5mYXRHID0gbnVtQXR0cihtZWFsLmVzdEZhdEcpO1xuXG4gICAgYXdhaXQgZGVwcy5kZGIuc2VuZChuZXcgUHV0SXRlbUNvbW1hbmQoeyBUYWJsZU5hbWU6IGRlcHMuZGF5TWVhbHNUYWJsZU5hbWUsIEl0ZW06IGl0ZW0gfSkpO1xuICAgIGF3YWl0IGRlcHMuZGRiLnNlbmQoXG4gICAgICBuZXcgVXBkYXRlSXRlbUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IHsgUzogdXNlcklkIH0sIG1lYWxJZDogeyBTOiBtU2sgfSB9LFxuICAgICAgICBVcGRhdGVFeHByZXNzaW9uOlxuICAgICAgICAgIFwiQUREIHRpbWVzTG9nZ2VkIDpvbmUgU0VUIGxhc3RMb2dnZWRBdCA9IDp0cywgdXBkYXRlZEF0ID0gOnRzXCIsXG4gICAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgICBcIjpvbmVcIjogeyBOOiBcIjFcIiB9LFxuICAgICAgICAgIFwiOnRzXCI6IHsgUzogbG9nZ2VkQXQgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgY29uc3Qgcm93ID0gZGF5RW50cnlGcm9tQXR0cnMoaXRlbSBhcyBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4sIGRheSk7XG4gICAgcmV0dXJuIGpzb24oMjAxLCB7IGVudHJ5OiByb3cgfSk7XG4gIH1cblxuICBjb25zdCBuYW1lID0gdHlwZW9mIGJvZHkubmFtZSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubmFtZS50cmltKCkgOiBcIlwiO1xuICBjb25zdCBtZWFsVHlwZSA9IHR5cGVvZiBib2R5Lm1lYWxfdHlwZSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubWVhbF90eXBlLnRyaW0oKSA6IFwiXCI7XG4gIGNvbnN0IGtjYWwgPSB0eXBlb2YgYm9keS5rY2FsID09PSBcIm51bWJlclwiID8gYm9keS5rY2FsIDogTnVtYmVyKGJvZHkua2NhbCk7XG4gIGNvbnN0IHByb3RlaW5HID0gdHlwZW9mIGJvZHkucHJvdGVpbl9nID09PSBcIm51bWJlclwiID8gYm9keS5wcm90ZWluX2cgOiBOdW1iZXIoYm9keS5wcm90ZWluX2cpO1xuICBpZiAoIW5hbWUgfHwgIWlzTWVhbFR5cGUobWVhbFR5cGUpIHx8ICFOdW1iZXIuaXNGaW5pdGUoa2NhbCkgfHwgIU51bWJlci5pc0Zpbml0ZShwcm90ZWluRykpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiRXhwZWN0ZWQgbWVhbF9pZCBvciAobmFtZSwgbWVhbF90eXBlLCBrY2FsLCBwcm90ZWluX2cpLlwiIH0pO1xuICB9XG4gIGNvbnN0IHBob3RvS2V5ID0gdHlwZW9mIGJvZHkucGhvdG9fa2V5ID09PSBcInN0cmluZ1wiID8gYm9keS5waG90b19rZXkudHJpbSgpIDogXCJcIjtcbiAgY29uc3Qgbm90ZXMgPSB0eXBlb2YgYm9keS5ub3RlcyA9PT0gXCJzdHJpbmdcIiA/IGJvZHkubm90ZXMudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgaXRlbTogUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+ID0ge1xuICAgIGRheUtleTogeyBTOiBkYXlLZXkgfSxcbiAgICBlbnRyeUlkOiB7IFM6IGVTayB9LFxuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBkYXk6IHsgUzogZGF5IH0sXG4gICAgbmFtZVNuYXBzaG90OiB7IFM6IG5hbWUgfSxcbiAgICBtZWFsVHlwZTogeyBTOiBtZWFsVHlwZSB9LFxuICAgIGtjYWw6IG51bUF0dHIoTWF0aC5yb3VuZChrY2FsKSksXG4gICAgcHJvdGVpbkc6IG51bUF0dHIoTWF0aC5yb3VuZChwcm90ZWluRyAqIDEwKSAvIDEwKSxcbiAgICBsb2dnZWRBdDogeyBTOiBsb2dnZWRBdCB9LFxuICB9O1xuICBpZiAocGhvdG9LZXkpIGl0ZW0ucGhvdG9LZXkgPSB7IFM6IHBob3RvS2V5IH07XG4gIGlmIChub3RlcykgaXRlbS5ub3RlcyA9IHsgUzogbm90ZXMuc2xpY2UoMCwgMjAwMCkgfTtcbiAgY29uc3QgY2cgPSBib2R5LmNhcmJzX2cgIT09IHVuZGVmaW5lZCA/IE51bWJlcihib2R5LmNhcmJzX2cpIDogTmFOO1xuICBjb25zdCBmZyA9IGJvZHkuZmF0X2cgIT09IHVuZGVmaW5lZCA/IE51bWJlcihib2R5LmZhdF9nKSA6IE5hTjtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShjZykpIGl0ZW0uY2FyYnNHID0gbnVtQXR0cihNYXRoLnJvdW5kKGNnICogMTApIC8gMTApO1xuICBpZiAoTnVtYmVyLmlzRmluaXRlKGZnKSkgaXRlbS5mYXRHID0gbnVtQXR0cihNYXRoLnJvdW5kKGZnICogMTApIC8gMTApO1xuXG4gIGF3YWl0IGRlcHMuZGRiLnNlbmQobmV3IFB1dEl0ZW1Db21tYW5kKHsgVGFibGVOYW1lOiBkZXBzLmRheU1lYWxzVGFibGVOYW1lLCBJdGVtOiBpdGVtIH0pKTtcbiAgY29uc3Qgcm93ID0gZGF5RW50cnlGcm9tQXR0cnMoaXRlbSBhcyBSZWNvcmQ8c3RyaW5nLCBBdHRyaWJ1dGVWYWx1ZT4sIGRheSk7XG4gIHJldHVybiBqc29uKDIwMSwgeyBlbnRyeTogcm93IH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlVjJEYXlNZWFsRW50cnlEZWxldGUoXG4gIHVzZXJJZDogc3RyaW5nLFxuICBkYXk6IHN0cmluZyxcbiAgZW50cnlJZFBhcmFtOiBzdHJpbmcsXG4gIGRlcHM6IHsgZGRiOiBEeW5hbW9EQkNsaWVudDsgZGF5TWVhbHNUYWJsZU5hbWU6IHN0cmluZyB9LFxuKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGlmICghaXNNZWFsTGlicmFyeUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgaXMgZGlzYWJsZWQuXCIgfSk7XG4gIH1cbiAgaWYgKCFpc0RhdGVTdHJpbmcoZGF5KSkgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkludmFsaWQgZGF5LlwiIH0pO1xuICBjb25zdCBkYXlLZXkgPSBgJHt1c2VySWR9IyR7ZGF5fWA7XG4gIGNvbnN0IGVTayA9IGVudHJ5SWRQYXJhbS5zdGFydHNXaXRoKFwiRU5UUlkjXCIpID8gZW50cnlJZFBhcmFtIDogZW50cnlTayhlbnRyeUlkUGFyYW0pO1xuICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGF3YWl0IGRlcHMuZGRiLnNlbmQoXG4gICAgbmV3IFVwZGF0ZUl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogZGVwcy5kYXlNZWFsc1RhYmxlTmFtZSxcbiAgICAgIEtleTogeyBkYXlLZXk6IHsgUzogZGF5S2V5IH0sIGVudHJ5SWQ6IHsgUzogZVNrIH0gfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246IFwiU0VUIGRlbGV0ZWRBdCA9IDpkXCIsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7IFwiOmRcIjogeyBTOiBub3cgfSB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4ganNvbigyMDAsIHsgb2s6IHRydWUgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVWMkZvb2RNZWFsQ29tcGxldGUoXG4gIHVzZXJJZDogc3RyaW5nLFxuICBldmVudDogSHR0cEV2ZW50LFxuICBkZXBzOiB7XG4gICAgZGRiOiBEeW5hbW9EQkNsaWVudDtcbiAgICBmb29kTG9nVGFibGVOYW1lOiBzdHJpbmc7XG4gICAgbWVhbHNUYWJsZU5hbWU6IHN0cmluZztcbiAgICBkYXlNZWFsc1RhYmxlTmFtZTogc3RyaW5nO1xuICB9LFxuKTogUHJvbWlzZTxIdHRwUmVzdWx0PiB7XG4gIGlmICghaXNNZWFsTGlicmFyeUVuYWJsZWRMYW1iZGEoKSkge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJNZWFsIGxpYnJhcnkgaXMgZGlzYWJsZWQuXCIgfSk7XG4gIH1cbiAgaWYgKHByb2Nlc3MuZW52LkZGX1BIT1RPX0ZPT0RfTE9HICE9PSBcInRydWVcIikge1xuICAgIHJldHVybiBqc29uKDQwMywgeyBlcnJvcjogXCJGb29kIHBob3RvIGxvZ2dpbmcgaXMgcmVxdWlyZWQgZm9yIG1lYWwtY29tcGxldGUuXCIgfSk7XG4gIH1cbiAgY29uc3QgcmF3ID0gcGFyc2VKc29uQm9keShldmVudCk7XG4gIGlmIChyYXcgPT09IG51bGwpIHJldHVybiBqc29uKDQwMCwgeyBlcnJvcjogXCJJbnZhbGlkIEpTT05cIiB9KTtcbiAgY29uc3QgYm9keSA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3QgZm9vZExvZ0lkID0gdHlwZW9mIGJvZHkuZm9vZExvZ0lkID09PSBcInN0cmluZ1wiID8gYm9keS5mb29kTG9nSWQudHJpbSgpIDogXCJcIjtcbiAgY29uc3QgY29uZmlybWVkS2NhbCA9IHR5cGVvZiBib2R5LmNvbmZpcm1lZEtjYWwgPT09IFwibnVtYmVyXCIgPyBib2R5LmNvbmZpcm1lZEtjYWwgOiBOdW1iZXIoYm9keS5jb25maXJtZWRLY2FsKTtcbiAgY29uc3QgY29uZmlybWVkUHJvdGVpbiA9XG4gICAgdHlwZW9mIGJvZHkuY29uZmlybWVkUHJvdGVpbiA9PT0gXCJudW1iZXJcIiA/IGJvZHkuY29uZmlybWVkUHJvdGVpbiA6IE51bWJlcihib2R5LmNvbmZpcm1lZFByb3RlaW4pO1xuICBjb25zdCBkaXNoTmFtZSA9IHR5cGVvZiBib2R5LmRpc2hOYW1lID09PSBcInN0cmluZ1wiID8gYm9keS5kaXNoTmFtZS50cmltKCkgOiBcIlwiO1xuICBjb25zdCBtZWFsVHlwZSA9IHR5cGVvZiBib2R5Lm1lYWxUeXBlID09PSBcInN0cmluZ1wiID8gYm9keS5tZWFsVHlwZS50cmltKCkgOiBcIlwiO1xuICBjb25zdCBzYXZlVG9MaWJyYXJ5ID0gYm9keS5zYXZlVG9MaWJyYXJ5ID09PSB0cnVlO1xuICBpZiAoIWZvb2RMb2dJZCB8fCAhTnVtYmVyLmlzRmluaXRlKGNvbmZpcm1lZEtjYWwpIHx8ICFOdW1iZXIuaXNGaW5pdGUoY29uZmlybWVkUHJvdGVpbikpIHtcbiAgICByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiRXhwZWN0ZWQgZm9vZExvZ0lkLCBjb25maXJtZWRLY2FsLCBjb25maXJtZWRQcm90ZWluLlwiIH0pO1xuICB9XG4gIGlmICghZGlzaE5hbWUgfHwgIWlzTWVhbFR5cGUobWVhbFR5cGUpKSB7XG4gICAgcmV0dXJuIGpzb24oNDAwLCB7IGVycm9yOiBcIkV4cGVjdGVkIGRpc2hOYW1lIGFuZCB2YWxpZCBtZWFsVHlwZS5cIiB9KTtcbiAgfVxuXG4gIGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgZGVwcy5kZGIuc2VuZChcbiAgICBuZXcgR2V0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBkZXBzLmZvb2RMb2dUYWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9LCBmb29kTG9nSWQ6IHsgUzogZm9vZExvZ0lkIH0gfSxcbiAgICAgIENvbnNpc3RlbnRSZWFkOiB0cnVlLFxuICAgIH0pLFxuICApO1xuICBpZiAoIWV4aXN0aW5nLkl0ZW0pIHJldHVybiBqc29uKDQwNCwgeyBlcnJvcjogXCJGb29kIGxvZyBub3QgZm91bmQuXCIgfSk7XG4gIGNvbnN0IGRheSA9IGV4aXN0aW5nLkl0ZW0uZGF5Py5TID8/IFwiXCI7XG4gIGNvbnN0IGltYWdlS2V5ID0gZXhpc3RpbmcuSXRlbS5pbWFnZUtleT8uUyA/PyBcIlwiO1xuICBpZiAoIWlzRGF0ZVN0cmluZyhkYXkpKSByZXR1cm4ganNvbig0MDAsIHsgZXJyb3I6IFwiSW52YWxpZCBmb29kIGxvZyBkYXkuXCIgfSk7XG5cbiAgYXdhaXQgZGVwcy5kZGIuc2VuZChcbiAgICBuZXcgVXBkYXRlSXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBkZXBzLmZvb2RMb2dUYWJsZU5hbWUsXG4gICAgICBLZXk6IHsgdXNlcklkOiB7IFM6IHVzZXJJZCB9LCBmb29kTG9nSWQ6IHsgUzogZm9vZExvZ0lkIH0gfSxcbiAgICAgIFVwZGF0ZUV4cHJlc3Npb246IFwiU0VUIGNvbmZpcm1lZEtjYWwgPSA6a2MsIGNvbmZpcm1lZFByb3RlaW4gPSA6cHIsIGNvbmZpcm1lZFRzID0gOmN0c1wiLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICBcIjprY1wiOiB7IE46IFN0cmluZyhNYXRoLnJvdW5kKGNvbmZpcm1lZEtjYWwpKSB9LFxuICAgICAgICBcIjpwclwiOiB7IE46IFN0cmluZyhNYXRoLnJvdW5kKGNvbmZpcm1lZFByb3RlaW4pKSB9LFxuICAgICAgICBcIjpjdHNcIjogeyBTOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSxcbiAgICAgIH0sXG4gICAgfSksXG4gICk7XG5cbiAgY29uc3QgZGF5S2V5ID0gYCR7dXNlcklkfSMke2RheX1gO1xuICBjb25zdCBlbnRyeVV1aWQgPSByYW5kb21VVUlEKCk7XG4gIGNvbnN0IGVTayA9IGVudHJ5U2soZW50cnlVdWlkKTtcbiAgY29uc3QgbG9nZ2VkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gIGNvbnN0IGNhcmJzRyA9IGJvZHkuY2FyYnNHICE9PSB1bmRlZmluZWQgPyBOdW1iZXIoYm9keS5jYXJic0cpIDogTmFOO1xuICBjb25zdCBmYXRHID0gYm9keS5mYXRHICE9PSB1bmRlZmluZWQgPyBOdW1iZXIoYm9keS5mYXRHKSA6IE5hTjtcblxuICBsZXQgbGlicmFyeU1lYWxTazogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBpZiAoc2F2ZVRvTGlicmFyeSkge1xuICAgIGNvbnN0IG5sS2V5ID0gbmFtZUxvb2t1cEtleSh1c2VySWQsIGRpc2hOYW1lKTtcbiAgICBjb25zdCBxID0gYXdhaXQgZGVwcy5kZGIuc2VuZChcbiAgICAgIG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICAgIEluZGV4TmFtZTogXCJOYW1lTG9va3VwS2V5SW5kZXhcIixcbiAgICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogXCJuYW1lTG9va3VwS2V5ID0gOmtcIixcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczogeyBcIjprXCI6IHsgUzogbmxLZXkgfSB9LFxuICAgICAgICBMaW1pdDogMTAsXG4gICAgICB9KSxcbiAgICApO1xuICAgIGxldCBmb3VuZDogTWVhbFJvdyB8IG51bGwgPSBudWxsO1xuICAgIGZvciAoY29uc3QgaXQgb2YgcS5JdGVtcyA/PyBbXSkge1xuICAgICAgY29uc3QgbSA9IG1lYWxGcm9tQXR0cnMoaXQgYXMgUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+KTtcbiAgICAgIGlmIChtICYmICFtLmRlbGV0ZWRBdCkge1xuICAgICAgICBmb3VuZCA9IG07XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZm91bmQpIHtcbiAgICAgIGxpYnJhcnlNZWFsU2sgPSBtZWFsU2soZm91bmQuaWQpO1xuICAgICAgYXdhaXQgZGVwcy5kZGIuc2VuZChcbiAgICAgICAgbmV3IFVwZGF0ZUl0ZW1Db21tYW5kKHtcbiAgICAgICAgICBUYWJsZU5hbWU6IGRlcHMubWVhbHNUYWJsZU5hbWUsXG4gICAgICAgICAgS2V5OiB7IHVzZXJJZDogeyBTOiB1c2VySWQgfSwgbWVhbElkOiB7IFM6IGxpYnJhcnlNZWFsU2sgfSB9LFxuICAgICAgICAgIFVwZGF0ZUV4cHJlc3Npb246XG4gICAgICAgICAgICBcIkFERCB0aW1lc0xvZ2dlZCA6b25lIFNFVCBsYXN0TG9nZ2VkQXQgPSA6dHMsIHVwZGF0ZWRBdCA9IDp0cywgZXN0S2NhbCA9IDprYywgZXN0UHJvdGVpbkcgPSA6cGdcIixcbiAgICAgICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgICAgICBcIjpvbmVcIjogeyBOOiBcIjFcIiB9LFxuICAgICAgICAgICAgXCI6dHNcIjogeyBTOiBsb2dnZWRBdCB9LFxuICAgICAgICAgICAgXCI6a2NcIjogeyBOOiBTdHJpbmcoTWF0aC5yb3VuZChjb25maXJtZWRLY2FsKSkgfSxcbiAgICAgICAgICAgIFwiOnBnXCI6IHsgTjogU3RyaW5nKE1hdGgucm91bmQoTnVtYmVyKGNvbmZpcm1lZFByb3RlaW4pICogMTApIC8gMTApIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSksXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBpZCA9IHJhbmRvbVVVSUQoKTtcbiAgICAgIGxpYnJhcnlNZWFsU2sgPSBtZWFsU2soaWQpO1xuICAgICAgY29uc3QgaXRlbTogUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+ID0ge1xuICAgICAgICB1c2VySWQ6IHsgUzogdXNlcklkIH0sXG4gICAgICAgIG1lYWxJZDogeyBTOiBsaWJyYXJ5TWVhbFNrIH0sXG4gICAgICAgIG5hbWVMb29rdXBLZXk6IHsgUzogbmxLZXkgfSxcbiAgICAgICAgbmFtZTogeyBTOiBkaXNoTmFtZSB9LFxuICAgICAgICBtZWFsVHlwZTogeyBTOiBtZWFsVHlwZSB9LFxuICAgICAgICBlc3RLY2FsOiBudW1BdHRyKE1hdGgucm91bmQoY29uZmlybWVkS2NhbCkpLFxuICAgICAgICBlc3RQcm90ZWluRzogbnVtQXR0cihNYXRoLnJvdW5kKE51bWJlcihjb25maXJtZWRQcm90ZWluKSAqIDEwKSAvIDEwKSxcbiAgICAgICAgc291cmNlOiB7IFM6IFwicGhvdG9cIiB9LFxuICAgICAgICB0aW1lc0xvZ2dlZDogeyBOOiBcIjFcIiB9LFxuICAgICAgICBsYXN0TG9nZ2VkQXQ6IHsgUzogbG9nZ2VkQXQgfSxcbiAgICAgICAgY3JlYXRlZEF0OiB7IFM6IGxvZ2dlZEF0IH0sXG4gICAgICAgIHVwZGF0ZWRBdDogeyBTOiBsb2dnZWRBdCB9LFxuICAgICAgfTtcbiAgICAgIGlmIChpbWFnZUtleSkgaXRlbS5waG90b0tleSA9IHsgUzogaW1hZ2VLZXkgfTtcbiAgICAgIGlmIChOdW1iZXIuaXNGaW5pdGUoY2FyYnNHKSkgaXRlbS5lc3RDYXJic0cgPSBudW1BdHRyKE1hdGgucm91bmQoY2FyYnNHICogMTApIC8gMTApO1xuICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShmYXRHKSkgaXRlbS5lc3RGYXRHID0gbnVtQXR0cihNYXRoLnJvdW5kKGZhdEcgKiAxMCkgLyAxMCk7XG4gICAgICBhd2FpdCBkZXBzLmRkYi5zZW5kKG5ldyBQdXRJdGVtQ29tbWFuZCh7IFRhYmxlTmFtZTogZGVwcy5tZWFsc1RhYmxlTmFtZSwgSXRlbTogaXRlbSB9KSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZGF5SXRlbTogUmVjb3JkPHN0cmluZywgQXR0cmlidXRlVmFsdWU+ID0ge1xuICAgIGRheUtleTogeyBTOiBkYXlLZXkgfSxcbiAgICBlbnRyeUlkOiB7IFM6IGVTayB9LFxuICAgIHVzZXJJZDogeyBTOiB1c2VySWQgfSxcbiAgICBkYXk6IHsgUzogZGF5IH0sXG4gICAgbmFtZVNuYXBzaG90OiB7IFM6IGRpc2hOYW1lIH0sXG4gICAgbWVhbFR5cGU6IHsgUzogbWVhbFR5cGUgfSxcbiAgICBrY2FsOiBudW1BdHRyKE1hdGgucm91bmQoY29uZmlybWVkS2NhbCkpLFxuICAgIHByb3RlaW5HOiBudW1BdHRyKE1hdGgucm91bmQoTnVtYmVyKGNvbmZpcm1lZFByb3RlaW4pICogMTApIC8gMTApLFxuICAgIGxvZ2dlZEF0OiB7IFM6IGxvZ2dlZEF0IH0sXG4gIH07XG4gIGlmIChpbWFnZUtleSkgZGF5SXRlbS5waG90b0tleSA9IHsgUzogaW1hZ2VLZXkgfTtcbiAgaWYgKE51bWJlci5pc0Zpbml0ZShjYXJic0cpKSBkYXlJdGVtLmNhcmJzRyA9IG51bUF0dHIoTWF0aC5yb3VuZChjYXJic0cgKiAxMCkgLyAxMCk7XG4gIGlmIChOdW1iZXIuaXNGaW5pdGUoZmF0RykpIGRheUl0ZW0uZmF0RyA9IG51bUF0dHIoTWF0aC5yb3VuZChmYXRHICogMTApIC8gMTApO1xuICBpZiAobGlicmFyeU1lYWxTaykge1xuICAgIGRheUl0ZW0ubGlicmFyeU1lYWxJZCA9IHsgUzogbGlicmFyeU1lYWxTayB9O1xuICAgIGRheUl0ZW0ubWVhbEhpc3RvcnlTayA9IHsgUzogYCR7bG9nZ2VkQXR9IyR7ZVNrfWAgfTtcbiAgfVxuXG4gIGF3YWl0IGRlcHMuZGRiLnNlbmQobmV3IFB1dEl0ZW1Db21tYW5kKHsgVGFibGVOYW1lOiBkZXBzLmRheU1lYWxzVGFibGVOYW1lLCBJdGVtOiBkYXlJdGVtIH0pKTtcbiAgY29uc3QgZW50cnkgPSBkYXlFbnRyeUZyb21BdHRycyhkYXlJdGVtIGFzIFJlY29yZDxzdHJpbmcsIEF0dHJpYnV0ZVZhbHVlPiwgZGF5KTtcbiAgcmV0dXJuIGpzb24oMjAwLCB7IG9rOiB0cnVlLCBlbnRyeSwgbGlicmFyeU1lYWxJZDogbGlicmFyeU1lYWxTayA/IHN0cmlwTWVhbFByZWZpeChsaWJyYXJ5TWVhbFNrKSA6IG51bGwgfSk7XG59XG4iXX0=