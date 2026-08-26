export const WEB_DEVICE_ID_KEY = "jpw.web.deviceId";
export const WEB_DEVICE_ID_SANDBOX_KEY = "jpw.web.deviceId.sandbox";
export const WEB_DEVICE_ID_RE = /^[a-f0-9]{64}$/;

export function webStorageNamespace() {
  return globalThis.JPW_WEB_STORAGE_NS === "sandbox" ? "sandbox" : "production";
}

export function deviceIdStorageKey(namespace = webStorageNamespace()) {
  return namespace === "sandbox" ? WEB_DEVICE_ID_SANDBOX_KEY : WEB_DEVICE_ID_KEY;
}

export function createWebDeviceId(randomBytes = defaultRandomBytes) {
  const bytes = randomBytes(32);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function readStoredDeviceId(storage, key = deviceIdStorageKey()) {
  const value = String(storage?.getItem?.(key) || "").trim().toLowerCase();
  return WEB_DEVICE_ID_RE.test(value) ? value : "";
}

export function getOrCreateWebDeviceId(storage = globalThis.localStorage, randomBytes = defaultRandomBytes, key = deviceIdStorageKey()) {
  const existing = readStoredDeviceId(storage, key);
  if (existing) return existing;
  const created = createWebDeviceId(randomBytes);
  storage.setItem(key, created);
  return created;
}

function defaultRandomBytes(size) {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
