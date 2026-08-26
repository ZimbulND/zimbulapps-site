import { LICENSE_PUBLIC_KEY_PEM } from "./licensePublicKey.js";
import { displayTrialDaysRemaining, parseLicenseText, serializePayload, TRIAL_DURATION_MS } from "./licensePayload.js";

export const WEB_EXPIRED_MESSAGE =
  "Your 7-day trial has ended. Your jobs are still saved in this browser and have not been deleted. Editing stays locked until you buy Job Profit Workbook — $199 one time.";
export const WEB_NEEDS_ACTIVATION_MESSAGE =
  "Start your 7-day free trial to use Job Profit Workbook on this phone. No credit card. Your jobs stay in this browser.";
export const WEB_WRONG_DEVICE_MESSAGE = "That license is for a different device.";
export const WEB_INVALID_LICENSE_MESSAGE = "That license file is not valid.";
export const WEB_TRIAL_DURATION_MS = TRIAL_DURATION_MS;

export function createWebEntitlementController(options) {
  const deviceId = String(options.deviceId || "").toLowerCase();
  const adapter = options.adapter;
  const verifyFn = options.verify || verifyLicenseRecord;
  const nowFn = options.now || (() => new Date());

  async function persist(state) {
    await adapter.set("entitlementState", state);
  }

  async function evaluate() {
    const now = nowFn();
    const state = (await adapter.get("entitlementState")) || {};
    const record = state.record || null;
    const lastSeen = laterIso(state.lastSeen, iso(now));
    const valid = await isUsableRecord(record, deviceId, verifyFn);

    if (valid && record.payload.type === "paid") {
      await persist({ record, lastSeen });
      return view("paid", record, now, lastSeen);
    }

    if (valid && record.payload.type === "trial") {
      const effective = laterIso(iso(now), lastSeen);
      const expired = Date.parse(effective) >= Date.parse(record.payload.trialEndsAt);
      const nextSeen = laterIso(lastSeen, iso(now));
      await persist({ record, lastSeen: nextSeen });
      return view(expired ? "expired" : "trial", record, now, nextSeen);
    }

    return view("needs-activation", null, now, lastSeen);
  }

  async function activateLicense(licenseText) {
    const record = parseLicenseText(licenseText);
    const type = record?.payload?.type;
    if (!record || (type !== "paid" && type !== "trial")) {
      return { ok: false, error: WEB_INVALID_LICENSE_MESSAGE };
    }
    if (String(record.payload.machineId || "").toLowerCase() !== deviceId) {
      return { ok: false, error: WEB_WRONG_DEVICE_MESSAGE };
    }
    if (!(await verifyFn(record))) {
      return { ok: false, error: WEB_INVALID_LICENSE_MESSAGE };
    }
    const now = nowFn();
    await persist({ record, lastSeen: iso(now) });
    return { ok: true, status: await evaluate() };
  }

  return { evaluate, activateLicense, deviceId };
}

export async function verifyLicenseRecord(record, publicKeyPem = LICENSE_PUBLIC_KEY_PEM) {
  if (!record?.payload || record.alg !== "ed25519" || !record.signature) return false;
  try {
    const key = await globalThis.crypto.subtle.importKey(
      "spki",
      pemToSpki(publicKeyPem),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const signature = Uint8Array.from(atob(record.signature), (char) => char.charCodeAt(0));
    const data = new TextEncoder().encode(serializePayload(record.payload));
    return globalThis.crypto.subtle.verify({ name: "Ed25519" }, key, signature, data);
  } catch {
    return false;
  }
}

async function isUsableRecord(record, deviceId, verifyFn) {
  if (!record || String(record.payload?.machineId || "").toLowerCase() !== deviceId) return false;
  const type = record.payload?.type;
  if (type !== "paid" && type !== "trial") return false;
  return Boolean(await verifyFn(record));
}

function view(status, record, now, lastSeen) {
  const ends = record?.payload?.trialEndsAt;
  const effective = laterIso(iso(now), lastSeen);
  let remainingMs = null;
  if (status === "trial" && ends) {
    remainingMs = Math.max(0, Date.parse(ends) - Date.parse(effective));
  }
  return {
    enabled: true,
    status,
    canMutate: status === "trial" || status === "paid",
    canBackup: false,
    licenseId: record?.payload?.licenseId || null,
    type: record?.payload?.type || null,
    issuedAt: record?.payload?.issuedAt || null,
    trialEndsAt: ends || null,
    daysRemaining: remainingMs == null ? null : displayTrialDaysRemaining(remainingMs),
    remainingMs,
    message:
      status === "expired"
        ? WEB_EXPIRED_MESSAGE
        : status === "trial"
          ? `Trial: ${displayTrialDaysRemaining(remainingMs)} day(s) remaining.`
          : status === "needs-activation"
            ? WEB_NEEDS_ACTIVATION_MESSAGE
            : "",
  };
}

function laterIso(a, b, c) {
  const times = [a, b, c].filter(Boolean).map((value) => Date.parse(value)).filter((value) => !Number.isNaN(value));
  if (!times.length) return iso(new Date());
  return new Date(Math.max(...times)).toISOString();
}

function iso(date) {
  return new Date(date).toISOString();
}

function pemToSpki(pem) {
  const b64 = String(pem)
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
