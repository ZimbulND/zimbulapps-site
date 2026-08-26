export const WEB_DEVICE_ID_KEY = "jpw.web.deviceId";
export const WEB_DEVICE_ID_RE = /^[a-f0-9]{64}$/;

export function createWebDeviceId(randomBytes = defaultRandomBytes) {
  const bytes = randomBytes(32);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function readStoredDeviceId(storage) {
  const value = String(storage?.getItem?.(WEB_DEVICE_ID_KEY) || "").trim().toLowerCase();
  return WEB_DEVICE_ID_RE.test(value) ? value : "";
}

export function getOrCreateWebDeviceId(storage = globalThis.localStorage, randomBytes = defaultRandomBytes) {
  const existing = readStoredDeviceId(storage);
  if (existing) return existing;
  const created = createWebDeviceId(randomBytes);
  storage.setItem(WEB_DEVICE_ID_KEY, created);
  return created;
}

function defaultRandomBytes(size) {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
