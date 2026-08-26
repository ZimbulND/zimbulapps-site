export const ENTITLEMENT_FORMAT = 1;
export const ENTITLEMENT_SCHEMA = 1;
export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

/** Display-only. Expiration still uses the signed trialEndsAt. */
export function displayTrialDaysRemaining(remainingMs) {
  if (remainingMs == null || remainingMs <= 0) return 0;
  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  return Math.min(TRIAL_DURATION_DAYS, Math.max(1, days));
}

export function serializePayload(payload) {
  return JSON.stringify({
    format: payload.format,
    schemaVersion: payload.schemaVersion,
    type: payload.type,
    machineId: payload.machineId,
    issuedAt: payload.issuedAt,
    trialEndsAt: payload.trialEndsAt ?? null,
    licenseId: payload.licenseId,
  });
}

export function parseLicenseText(text) {
  try {
    const record = JSON.parse(String(text || ""));
    if (!record || typeof record !== "object" || !record.payload) return null;
    return record;
  } catch {
    return null;
  }
}
