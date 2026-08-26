import { CHECKOUT_UNAVAILABLE_MESSAGE, checkoutRequestBody, isTrustedCheckoutUrl, safeCheckoutSessionId } from "./purchase.js";

export const CONNECT_OFFLINE_MESSAGE =
  "This computer needs to connect once to start your 7-day trial. Check your internet connection and try again. Your jobs stay on this computer.";

export const COMMERCIAL_BODY_FIELDS = ["name", "email", "businessName", "mobile", "consent", "machineId"];
export { checkoutRequestBody };

export function commercialRequestBody(input = {}) {
  const body = {};
  for (const field of COMMERCIAL_BODY_FIELDS) {
    if (input[field] === undefined || input[field] === null) continue;
    body[field] = input[field];
  }
  return body;
}

export async function requestSignedTrial(baseUrl, input, fetchImpl = fetch) {
  if (!baseUrl) {
    return { ok: false, error: CONNECT_OFFLINE_MESSAGE, code: "offline" };
  }
  const url = new URL("/v1/register-and-issue", String(baseUrl));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(commercialRequestBody(input)),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: data.error || CONNECT_OFFLINE_MESSAGE,
        code: data.code || "issue-failed",
      };
    }
    if (!data.license) {
      return { ok: false, error: CONNECT_OFFLINE_MESSAGE, code: "issue-failed" };
    }
    return { ok: true, license: data.license };
  } catch {
    return { ok: false, error: CONNECT_OFFLINE_MESSAGE, code: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

export async function requestCheckoutSession(baseUrl, input, fetchImpl = fetch) {
  if (!baseUrl) {
    return { ok: false, error: CHECKOUT_UNAVAILABLE_MESSAGE, code: "offline" };
  }
  const url = new URL("/v1/checkout/session", String(baseUrl));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkoutRequestBody(input)),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (data.alreadyPaid === true) {
      return { ok: true, alreadyPaid: true };
    }
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        error: data.error || CHECKOUT_UNAVAILABLE_MESSAGE,
        code: data.code || "checkout-failed",
        status: res.status,
      };
    }
    if (!isTrustedCheckoutUrl(data.url)) {
      return { ok: false, error: CHECKOUT_UNAVAILABLE_MESSAGE, code: "invalid-checkout-url" };
    }
    return {
      ok: true,
      url: data.url,
      sessionId: safeCheckoutSessionId(data.sessionId),
    };
  } catch {
    return { ok: false, error: CHECKOUT_UNAVAILABLE_MESSAGE, code: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

export async function requestPaidLicense(baseUrl, input, fetchImpl = fetch) {
  if (!baseUrl) {
    return { ok: false, error: "Could not reach the licensing service.", code: "offline" };
  }
  const url = new URL("/v1/admin/mark-paid", String(baseUrl));
  const headers = { "Content-Type": "application/json" };
  if (input.adminToken) headers.Authorization = `Bearer ${input.adminToken}`;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: input.email, machineId: input.machineId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, error: data.error || "Could not issue a paid license.", code: data.code };
    }
    return { ok: true, license: data.license };
  } catch {
    return { ok: false, error: "Could not reach the licensing service.", code: "offline" };
  }
}
