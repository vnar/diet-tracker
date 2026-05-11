/**
 * User-facing product version (About modal, footer changelog, marketing copy).
 * Bump when you ship a meaningful UX slice; keep CHANGELOG in sync below.
 */
export const OJAS_PRODUCT_VERSION_LABEL = "v1.1.0";

export type ChangelogEntry = {
  version: string;
  date: string;
  note: string;
  latest: boolean;
};

/** Newest first. Only one entry should have `latest: true`. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.1.0",
    date: "May 7 2026",
    note:
      "Voice daily log (speech or text → review): colloquial food kcal/protein deltas on Today’s grid, activity line handoff to Energy balance, parse on same AWS Lambda Anthropic key as photo meals.",
    latest: true,
  },
  {
    version: "v1.0.0",
    date: "Mar 21 2026",
    note: "Amplify static hosting pipeline · Initial release",
    latest: false,
  },
  {
    version: "v0.9.0",
    date: "Mar 14 2026",
    note: "Auth flow with Cognito · DynamoDB entries schema",
    latest: false,
  },
];
