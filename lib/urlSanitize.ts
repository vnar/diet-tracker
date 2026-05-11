/**
 * Strip invisible / directionality characters that sometimes get pasted into URLs
 * (e.g. U+2060 WORD JOINER after a link in chat apps) so shared links resolve correctly.
 */
export function stripInvisibleFromUrl(input: string): string {
  let s = input.trim();
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "");
  s = s.replace(/[\u180E\u00AD]/g, "");
  return s.trim();
}
