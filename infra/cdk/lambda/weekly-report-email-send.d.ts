type HttpResult = {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
};
type JsonFn = (statusCode: number, payload: unknown) => HttpResult;
type EmailSendEvent = {
    body?: string | null;
};
export declare function handlePostV2WeeklyReportSendEmail(accessToken: string | undefined, event: EmailSendEvent, json: JsonFn): Promise<HttpResult>;
export {};
