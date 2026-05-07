/**
 * Dice coefficient on character trigrams (Postgres `pg_trgm`-style similarity proxy).
 * Returns 0–1.
 */
export declare function trigramSimilarity(a: string, b: string): number;
export type NamedMeal = {
    id: string;
    name: string;
};
export declare function bestLibraryMatch<T extends NamedMeal>(query: string, library: readonly T[], threshold?: number): {
    meal: T;
    score: number;
} | null;
