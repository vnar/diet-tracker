export function shouldProcessBillingEvent(alreadyProcessed: boolean): boolean {
  return !alreadyProcessed;
}
