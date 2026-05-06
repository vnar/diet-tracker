import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
export declare function runFoodLogConfirmForUser(input: {
    userId: string;
    foodLogId: string;
    confirmedKcal: number;
    confirmedProtein: number;
}, deps: {
    ddb: DynamoDBClient;
    foodLogTableName: string;
}): Promise<{
    ok: true;
} | {
    ok: false;
    status: number;
    error: string;
}>;
