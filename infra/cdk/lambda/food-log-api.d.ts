import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { S3Client } from "@aws-sdk/client-s3";
export type HttpEvent = {
    body?: string | null;
};
export type HttpResult = {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
};
export declare function handleV2FoodEstimate(userId: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    s3: S3Client;
    foodLogTableName: string;
    photoBucketName: string;
}): Promise<HttpResult>;
export declare function handleV2FoodLogConfirm(userId: string, event: HttpEvent, deps: {
    ddb: DynamoDBClient;
    foodLogTableName: string;
}): Promise<HttpResult>;
