import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { S3Client } from "@aws-sdk/client-s3";
import type { FoodEstimateResponse } from "../food/contracts";
export declare function runFoodEstimateForUser(input: {
    userId: string;
    photoUrl: string;
    day: string;
    anthropicApiKey: string;
}, deps: {
    ddb: DynamoDBClient;
    s3: S3Client;
    foodLogTableName: string;
    photoBucketName: string;
}): Promise<{
    ok: true;
    data: FoodEstimateResponse;
} | {
    ok: false;
    status: number;
    error: string;
}>;
