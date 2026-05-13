/** Soft nudge when logged protein is below a reference band (not medical advice). */
export function suggestProteinHint(proteinG: number | undefined | null): string | null {
  if (proteinG == null || Number.isNaN(proteinG)) return null;
  if (proteinG >= 90) return null;
  return `You have logged about ${Math.round(proteinG)}g protein today. Many people aiming for satiety and lean mass use ~90–120g as a working band — tune this with your clinician.`;
}
