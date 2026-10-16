export function isWebRuntime() {
  return globalThis.JPW_WEB_RUNTIME === true;
}

export function unavailableWebEntitlement() {
  return {
    enabled: true, status: "unavailable", canMutate: false, canBackup: false,
    message: "Could not verify browser licensing. Editing is unavailable. Reload to try again; do not start another purchase to resolve this error.",
  };
}
