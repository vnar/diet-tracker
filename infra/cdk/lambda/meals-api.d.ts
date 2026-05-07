import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
export type HttpEvent = {
    body?: string | null;
    queryStringParameters?: Record<string, string | undefined> | null;
};
export type HttpResult = {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
};
export declare function handleV2MealsSuggestMatch(userId: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    mealsTableName: string;
}): Promise<HttpResult>;
export declare function handleV2MealsList(userId: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    mealsTableName: string;
}): Promise<HttpResult>;
export declare function handleV2MealsCreate(userId: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    mealsTableName: string;
}): Promise<HttpResult>;
export declare function handleV2MealsPatch(userId: string, mealIdParam: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    mealsTableName: string;
}): Promise<HttpResult>;
export declare function handleV2MealsDelete(userId: string, mealIdParam: string, deps: {
    ddb: DynamoDBClient;
    mealsTableName: string;
}): Promise<HttpResult>;
export declare function handleV2MealsHistory(userId: string, mealIdParam: string, deps: {
    ddb: DynamoDBClient;
    dayMealsTableName: string;
}): Promise<HttpResult>;
export declare function handleV2DayMealEntriesList(userId: string, day: string, deps: {
    ddb: DynamoDBClient;
    dayMealsTableName: string;
}): Promise<HttpResult>;
export declare function handleV2DayMealEntriesCreate(userId: string, day: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    dayMealsTableName: string;
    mealsTableName: string;
}): Promise<HttpResult>;
export declare function handleV2DayMealEntryDelete(userId: string, day: string, entryIdParam: string, deps: {
    ddb: DynamoDBClient;
    dayMealsTableName: string;
}): Promise<HttpResult>;
export declare function handleV2FoodMealComplete(userId: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    foodLogTableName: string;
    mealsTableName: string;
    dayMealsTableName: string;
}): Promise<HttpResult>;
