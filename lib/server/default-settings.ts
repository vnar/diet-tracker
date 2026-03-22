function defaultTargetDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 118);
  return d.toISOString().slice(0, 10);
}

export function defaultSettingsCreate(userId: string) {
  return {
    userId,
    goalWeight: 72,
    startWeight: 85,
    targetDate: defaultTargetDate(),
    unit: "kg",
  };
}
