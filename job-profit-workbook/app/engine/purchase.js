/**
 * Browser-safe purchase copy, URL checks, and poll bounds.
 * Paid UI must still come from a locally verified entitlement status.
 */

export const BUY_LABEL = "Buy Job Profit Workbook — $199";
export const UNLOCK_LABEL = "Unlock Job Profit Workbook — $199";
export const ONE_TIME_HELP = "One-time purchase. No subscription. License is for this computer.";
export const CHECKOUT_IN_BROWSER = "Complete your purchase in the browser.";
export const UNLOCKED_MESSAGE = "Job Profit Workbook is unlocked.";
export const DELAYED_MESSAGE =
  "Payment may still be processing. Use Check purchase status in a moment.";
export const CHECKOUT_UNAVAILABLE_MESSAGE =
  "Could not start checkout. Check your internet connection and try again.";
export const REFRESH_OFFLINE_MESSAGE =
  "Could not check purchase status. Payment may still be processing. Check your internet connection and try again.";
export const CHECKOUT_NEEDS_TRIAL_MESSAGE = "Start your 7-day trial before purchasing.";
export const LICENSING_DISABLED_MESSAGE = "Licensing is not enabled in this session.";
export const BROWSER_OPEN_HELP = "If the browser did not open, use Open checkout page.";

export const STRIPE_CHECKOUT_HOST = "checkout.stripe.com";
export const CHECKOUT_POLL_INTERVAL_MS = 4000;
export const CHECKOUT_POLL_DURATION_MS = 120000;

export function isTrustedCheckoutUrl(urlString) {
  if (typeof urlString !== "string" || !urlString || urlString.length > 2048) return false;
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return false;
    if (url.hostname !== STRIPE_CHECKOUT_HOST) return false;
    if (url.username || url.password) return false;
    if (url.port && url.port !== "443") return false;
    return true;
  } catch {
    return false;
  }
}

export function checkoutRequestBody(input = {}) {
  const machineId = String(input?.machineId || "").trim().toLowerCase();
  const body = machineId ? { machineId } : {};
  if (input?.channel === "web") body.channel = "web";
  return body;
}

export function safeCheckoutSessionId(value) {
  const id = String(value || "");
  return /^cs_[a-zA-Z0-9_]+$/.test(id) ? id : null;
}

export function nextPollDecision({ startedAt = 0, now = 0, paid = false, cancelled = false } = {}) {
  if (cancelled) return { continue: false, reason: "cancelled" };
  if (paid) return { continue: false, reason: "paid" };
  if (now - startedAt >= CHECKOUT_POLL_DURATION_MS) return { continue: false, reason: "timeout" };
  return { continue: true, reason: "poll", waitMs: CHECKOUT_POLL_INTERVAL_MS };
}

export function purchaseAction(status) {
  if (status === "trial") {
    return { id: "buy-license", label: BUY_LABEL, backup: false };
  }
  if (status === "expired") {
    return { id: "unlock-license", label: UNLOCK_LABEL, backup: true };
  }
  return null;
}

export function isUnlockedEntitlement(entitlement) {
  return entitlement?.status === "paid" || entitlement?.status === "unrestricted";
}

export function licenseBannerModel(entitlement, purchase = { phase: "idle" }) {
  if (
    !entitlement?.enabled ||
    entitlement.status === "paid" ||
    entitlement.status === "unrestricted" ||
    entitlement.status === "needs-activation"
  ) {
    return { show: false };
  }
  const action = purchaseAction(entitlement.status);
  const phase = purchase?.phase || "idle";
  const checkoutOpen = phase === "starting" || phase === "checkout" || phase === "polling" || phase === "delayed";
  return {
    show: true,
    expired: entitlement.status === "expired",
    trial: entitlement.status === "trial",
    message: entitlement.message || (entitlement.status === "expired" ? "Your trial has ended." : "Trial active."),
    help: ONE_TIME_HELP,
    action,
    backup: Boolean(action?.backup),
    phase,
    checkoutOpen,
    checkoutUrl: isTrustedCheckoutUrl(purchase?.url) ? purchase.url : null,
    opened: Boolean(purchase?.opened),
    delayed: phase === "delayed",
  };
}
