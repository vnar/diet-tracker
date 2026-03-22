export function kgToLbs(kg: number): number {
  return kg * 2.2046226218;
}

export function lbsToKg(lbs: number): number {
  return lbs * 0.45359237;
}

export function displayWeight(kg: number, unit: "kg" | "lbs"): string {
  const v = unit === "kg" ? kg : kgToLbs(kg);
  return v.toFixed(1);
}

export function inputToKg(value: number, unit: "kg" | "lbs"): number {
  return unit === "kg" ? value : lbsToKg(value);
}

export function kgToInput(kg: number, unit: "kg" | "lbs"): number {
  return unit === "kg" ? kg : kgToLbs(kg);
}
