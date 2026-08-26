import { commercialRequestBody } from "/engine/licenseClient.js";
import { resolveWebLicenseOrigin } from "/engine/licenseOrigin.js";
import { createWebApi } from "/engine/webApi.js";
import { createWebEntitlementController } from "/engine/webEntitlement.js";
import { createWebWorkbookStore } from "/engine/webStorage.js";
import { getOrCreateWebDeviceId } from "/engine/webDeviceId.js";

export { createWebApi };

export async function createBrowserWebApi() {
  const { openWebIdbAdapter } = await import("./webIdb.js");
  const adapter = await openWebIdbAdapter();
  const deviceId = getOrCreateWebDeviceId();
  await adapter.set("deviceId", deviceId);
  const store = createWebWorkbookStore(adapter);
  await store.ensure();
  const entitlement = createWebEntitlementController({ adapter, deviceId });
  const licenseUrl = webLicenseOrigin();
  const api = createWebApi({ store, entitlement, licenseUrl });
  const originalConnect = api.connectTrial;
  api.connectTrial = async (body) => {
    const result = await originalConnect(body);
    if (result?.ok) await adapter.set("registration", commercialRequestBody(body));
    return result;
  };
  return api;
}

export function webLicenseOrigin() {
  return resolveWebLicenseOrigin({
    locationOrigin: typeof location !== "undefined" ? location.origin : "",
    override: globalThis.JPW_LICENSE_ORIGIN,
  });
}
