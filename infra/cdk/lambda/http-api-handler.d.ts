type Claims = {
    sub: string;
    [key: string]: unknown;
};
type HttpEvent = {
    rawPath: string;
    requestContext?: {
        authorizer?: {
            jwt?: {
                claims?: Claims;
            };
        };
    };
    queryStringParameters?: Record<string, string | undefined> | null;
    body?: string | null;
};
type HttpResult = {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
};
export declare function handler(event: HttpEvent): Promise<HttpResult>;
export {};
