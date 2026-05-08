type HttpEvent = {
    rawPath: string;
    body?: string | null;
    requestContext?: {
        http?: {
            method?: string;
        };
        authorizer?: {
            jwt?: {
                claims?: Record<string, unknown> | string;
            };
        };
    };
};
type HttpResult = {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
};
export declare function handler(event: HttpEvent): Promise<HttpResult>;
export {};
