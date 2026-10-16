import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { generateKeyPairSync, sign } from "node:crypto";
import { createWebEntitlementController, verifyLicenseRecord } from "../job-profit-workbook/app/engine/webEntitlement.js";
import { serializePayload, TRIAL_DURATION_DAYS } from "../job-profit-workbook/app/engine/licensePayload.js";
import { createWebApi } from "../job-profit-workbook/app/engine/webApi.js";
import { unavailableWebEntitlement } from "../job-profit-workbook/app/js/webRuntime.js";

// All signing keys and licenses below are generated in memory for this test.
// No production key, registration, checkout, network call or persistent record is used.
const now = new Date("2026-10-16T12:00:00Z");
const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
function record(type, ends = "2026-10-20T12:00:00Z") {
  const payload = {
    format: 1, schemaVersion: 1, type, machineId: "test-browser",
    issuedAt: "2026-10-13T12:00:00Z", trialEndsAt: type === "trial" ? ends : null,
    licenseId: "test-fixture-only",
  };
  return { payload, alg: "ed25519", signature: sign(null, Buffer.from(serializePayload(payload)), keys.privateKey).toString("base64") };
}
function controller(license) {
  const data = new Map(license ? [["entitlementState", { record: license }]] : []);
  const adapter = { get: async k => data.get(k), set: async (k, v) => data.set(k, v) };
  return createWebEntitlementController({
    adapter, deviceId: "test-browser", now: () => now,
    verify: r => verifyLicenseRecord(r, publicKey),
  });
}

test("seven-day trial contract remains unchanged", () => assert.equal(TRIAL_DURATION_DAYS, 7));
for (const [label, fixture, expected] of [
  ["unactivated", null, "needs-activation"],
  ["signed current trial", record("trial"), "trial"],
  ["signed expired trial", record("trial", "2026-10-15T12:00:00Z"), "expired"],
  ["signed paid license", record("paid"), "paid"],
  ["tampered license", { ...record("paid"), signature: "invalid" }, "needs-activation"],
]) {
  test(`browser entitlement: ${label}`, async () => {
    const status = await controller(fixture).evaluate();
    assert.equal(status.status, expected);
    assert.equal(status.canMutate, expected === "trial" || expected === "paid");
    assert.equal(status.canBackup, false);
  });
}
test("wrong-device licenses cannot activate", async () => {
  const fixture = record("paid");
  fixture.payload.machineId = "another-device";
  assert.equal((await controller(null).activateLicense(JSON.stringify(fixture))).ok, false);
});
test("future limited demo is not implemented by granting an unrestricted browser state", () => {
  const state = unavailableWebEntitlement();
  assert.equal(state.enabled, true);
  assert.equal(state.status, "unavailable");
  assert.equal(state.canMutate, false);
  assert.equal(state.canBackup, false);
});

for (const fixture of [null, record("trial", "2026-10-15T12:00:00Z")]) {
  test(`unlicensed/expired API denies all writes (${fixture ? "expired" : "unactivated"})`, async () => {
    let writes = 0;
    let requests = 0;
    const store = new Proxy({}, { get: (_, key) => key === "getJob" ? async () => null : async () => { writes++; } });
    const api = createWebApi({
      store, entitlement: controller(fixture), licenseUrl: "https://unused.invalid",
      fetchImpl: async () => { requests++; throw Error("Network forbidden in tests"); },
    });
    for (const action of [
      () => api.saveSetup({}), () => api.createJob(), () => api.saveJob("id", {}),
      () => api.deleteJob("id"), () => api.duplicateJob("id"),
      () => api.openExample(), () => api.restoreExample(),
    ]) await assert.rejects(action);
    assert.equal(writes, 0);
    if (!fixture) assert.equal((await api.startCheckout()).ok, false);
    assert.equal(requests, 0);
  });
}
test("entitlement evaluation failure denies API writes rather than bypassing licensing", async () => {
  let writes = 0;
  const api = createWebApi({
    store: { saveSetup: () => writes++ },
    entitlement: { evaluate: async () => { throw Error("storage unavailable"); } },
  });
  await assert.rejects(() => api.saveSetup({}));
  assert.equal(writes, 0);
});

const script = await readFile(new URL("../contact.js", import.meta.url), "utf8");
function contactContext(host, online = true) {
  const status = { textContent: "" };
  const button = { disabled: false, textContent: "" };
  let handler;
  const form = { querySelector: () => button, addEventListener: (_, fn) => handler = fn };
  vm.runInNewContext(script, {
    document: { querySelector: () => form, getElementById: () => status },
    location: { hostname: host }, navigator: { onLine: online },
    fetch: () => { throw Error("Contact script must not send requests"); },
  });
  let prevented = false;
  return { button, status, submit: () => { handler({ preventDefault: () => prevented = true }); return prevented; } };
}
for (const host of ["localhost", "127.0.0.1", "[::1]", "project.kirk.replit.dev", "project.replit.app", "project.repl.co"]) {
  test(`contact never submits from preview: ${host}`, () => {
    const context = contactContext(host);
    assert.equal(context.button.disabled, true);
    assert.equal(context.submit(), true);
    assert.match(context.status.textContent, /Nothing sent/);
  });
}
for (const host of ["zimbulapps.com", "www.zimbulapps.com", "branch--site.netlify.app"]) {
  test(`native Netlify submit preserved without actually sending: ${host}`, () => {
    const context = contactContext(host);
    assert.equal(context.button.disabled, false);
    assert.equal(context.submit(), false);
    assert.match(context.status.textContent, /not confirmed/);
  });
}
test("offline form prevents native submission and gives recovery guidance", () => {
  const context = contactContext("zimbulapps.com", false);
  assert.equal(context.submit(), true);
  assert.match(context.status.textContent, /offline/);
});
