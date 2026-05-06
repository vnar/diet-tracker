export function normalizeMealName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function nameLookupKey(userId: string, name: string): string {
  return `${userId}#${normalizeMealName(name)}`;
}
