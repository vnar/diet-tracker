export type HttpEvent = {
    body?: string | null;
    queryStringParameters?: Record<string, string | undefined> | null;
};
export type HttpResult = {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
};
export declare function handleBillingCheckoutSession(userId: string, event: HttpEvent): Promise<HttpResult>;
export declare function handleBillingPortalSession(userId: string): Promise<HttpResult>;
