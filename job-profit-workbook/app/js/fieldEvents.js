/** Common contractor units. The Unit field also accepts any custom text. */
export const UNIT_SUGGESTIONS = ["hrs", "each", "sq ft", "linear ft", "day", "lump sum"];

/** Sentinel for the Unit dropdown only. Never stored on a job line. */
export const OTHER_UNIT = "__other__";

export function isStandardUnit(unit) {
  return UNIT_SUGGESTIONS.includes(String(unit || "").trim());
}

/** Value to select in the Unit dropdown for a stored line unit. */
export function unitSelectValue(unit) {
  const value = String(unit || "").trim();
  return isStandardUnit(value) ? value : OTHER_UNIT;
}

/**
 * Stored unit after a dropdown change.
 * Switching from a standard unit to Other… starts blank so "each" is not kept as custom text.
 * A true custom value such as "box" is kept when Other… remains selected.
 */
export function unitStoredFromSelect(selectValue, previousUnit) {
  if (selectValue !== OTHER_UNIT) return String(selectValue || "");
  const previous = String(previousUnit || "").trim();
  if (!previous || isStandardUnit(previous)) return "";
  return previous;
}

/** Labor uses the job labor-burden rate; every other category defaults to 0. */
export function burdenRateForCategory(category, jobBurdenRate) {
  const rate = Number(jobBurdenRate);
  if (String(category || "").toLowerCase() !== "labor") return 0;
  return Number.isFinite(rate) ? rate : 0;
}

/** Apply category-driven burden defaults. Does not run on estimate-to-actual copy. */
export function applyCategoryChange(line, category, jobBurdenRate) {
  const next = { ...line, category };
  next.laborBurdenRate = burdenRateForCategory(category, jobBurdenRate);
  if (String(category || "").toLowerCase() === "labor") {
    next.unit = next.unit || "hrs";
  }
  return next;
}

/**
 * Full job-form rebuild is safe on blur/select change, not on each keystroke.
 * Rebuilding type=number inputs drops the caret and can reverse digits (120 → 210).
 */
export function shouldRebuildJobForm(event) {
  const field = event?.target;
  if (!field) return false;
  const tag = String(field.tagName || "").toUpperCase();
  if (tag === "SELECT") return true;
  return event.type === "change";
}

/** Documents the caret-at-start bug when a number field is rebuilt after every key. */
export function digitsAfterEachKey(keys, rebuildBetweenKeys) {
  let value = "";
  let caret = 0;
  for (const key of keys) {
    if (rebuildBetweenKeys) caret = 0;
    value = value.slice(0, caret) + key + value.slice(caret);
    caret += key.length;
  }
  return value;
}
