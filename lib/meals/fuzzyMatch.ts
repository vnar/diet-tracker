function trigrams(s: string): Map<string, number> {
  const pad = `  ${s.toLowerCase().trim()}  `.replace(/\s+/g, " ");
  const m = new Map<string, number>();
  for (let i = 0; i < pad.length - 2; i++) {
    const t = pad.slice(i, i + 3);
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

/**
 * Dice coefficient on character trigrams (Postgres `pg_trgm`-style similarity proxy).
 * Returns 0–1.
 */
export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const [t, ca] of A) {
    const cb = B.get(t);
    if (cb !== undefined) inter += Math.min(ca, cb);
  }
  let sumA = 0;
  for (const v of A.values()) sumA += v;
  let sumB = 0;
  for (const v of B.values()) sumB += v;
  return (2 * inter) / (sumA + sumB);
}

export type NamedMeal = { id: string; name: string };

export function bestLibraryMatch<T extends NamedMeal>(
  query: string,
  library: readonly T[],
  threshold = 0.6,
): { meal: T; score: number } | null {
  let best: { meal: T; score: number } | null = null;
  for (const meal of library) {
    const score = trigramSimilarity(query, meal.name);
    if (score >= threshold && (!best || score > best.score)) {
      best = { meal, score };
    }
  }
  return best;
}
