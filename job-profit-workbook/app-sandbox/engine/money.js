/**
 * Money helpers. All stored/displayed amounts are USD with cents.
 * Rounding is half-up to the nearest cent, matching typical spreadsheet behavior.
 */

export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  const cleaned = String(value).trim().replace(/[$,%]/g, "");
  if (cleaned === "") return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

/** Integer cents from a dollar amount. */
export function toCents(value) {
  const n = toNumber(value, 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Number(`${n}e2`));
}

export function fromCents(cents) {
  return toNumber(cents, 0) / 100;
}

export function roundMoney(value) {
  return fromCents(toCents(value));
}

/** Percent form (25) to rate (0.25). */
export function percentToRate(percent) {
  return toNumber(percent, 0) / 100;
}

/** Rate (0.25) to percent form (25). */
export function rateToPercent(rate) {
  return roundMoney(toNumber(rate, 0) * 100);
}

export function centsFromQuantityCost(quantity, unitCost) {
  return toCents(toNumber(quantity, 0) * toNumber(unitCost, 0));
}

export function applyRateToCents(cents, rate) {
  return Math.round(toNumber(cents, 0) * toNumber(rate, 0));
}
