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
export declare function handleV2ActivityEstimateBurn(event: HttpEvent): Promise<HttpResult>;
export declare function handleV2ActivityLog(userId: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    entriesTableName: string;
}): Promise<HttpResult>;
export declare function handleV2ActivityCalibrationPatch(userId: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    settingsTableName: string;
}): Promise<HttpResult>;
export declare function handleV2EnergyWeeklySummary(userId: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    entriesTableName: string;
    dayMealsTableName: string;
    settingsTableName: string;
}): Promise<HttpResult>;
