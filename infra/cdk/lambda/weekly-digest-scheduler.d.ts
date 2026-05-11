export declare function handler(): Promise<{
    ok: boolean;
    weekStart?: string;
    weekEnd?: string;
    processed?: number;
    sent?: number;
    errors?: number;
}>;
