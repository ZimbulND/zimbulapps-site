/**
 * HTTPS origin of the hosted licensing service.
 * Override with JOBPROFIT_LICENSE_URL or a license-origin.txt next to server.js.
 * This is not a secret.
 *
 * Production key rotation: generate a new Ed25519 pair in the issuing environment,
 * store the private key only as a host secret, ship the matching public key in
 * engine/licensePublicKey.js, and re-issue entitlements. Do not keep verifying
 * retired prototype keys.
 */
export const DEFAULT_LICENSE_ORIGIN = "https://jobprofit-license.nine-samba.workers.dev";
export const SANDBOX_LICENSE_ORIGIN = "https://jobprofit-license-sandbox.nine-samba.workers.dev";

export function resolveWebLicenseOrigin({ locationOrigin, override } = {}) {
  if (locationOrigin && /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/i.test(locationOrigin)) {
    return locationOrigin;
  }
  if (override === SANDBOX_LICENSE_ORIGIN) return SANDBOX_LICENSE_ORIGIN;
  return DEFAULT_LICENSE_ORIGIN;
}
