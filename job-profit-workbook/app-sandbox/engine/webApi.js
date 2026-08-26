import { commercialRequestBody, requestCheckoutSession, requestSignedTrial } from "./licenseClient.js";
import { checkoutRequestBody } from "./purchase.js";
import { EXAMPLE_JOB_ID } from "./sampleJob.js";

export function createWebApi(options) {
  const store = options.store;
  const entitlement = options.entitlement;
  const licenseUrl = options.licenseUrl;
  const fetchImpl = options.fetchImpl || fetch;

  function expiredError(status) {
    const error = new Error(status.message || "Your trial has ended.");
    error.code = status.status === "needs-activation" ? "needs-activation" : "trial-expired";
    error.entitlement = status;
    throw error;
  }

  async function requireMutate() {
    const status = await entitlement.evaluate();
    if (!status.canMutate) expiredError(status);
    return status;
  }

  async function refreshPaid() {
    const current = await entitlement.evaluate();
    if (current.status === "paid") return { ok: true, status: current };
    const stored = await store.adapter.get("registration");
    const hasIdentity = Boolean(stored?.name && stored?.email && stored.consent === true);
    const requestBody = hasIdentity
      ? { ...commercialRequestBody(stored), machineId: entitlement.deviceId }
      : { machineId: entitlement.deviceId };
    const issued = await requestSignedTrial(licenseUrl, requestBody, fetchImpl);
    if (!issued.ok) {
      const error = new Error(issued.error || "Could not check purchase status.");
      error.code = issued.code;
      throw error;
    }
    const result = await entitlement.activateLicense(JSON.stringify(issued.license));
    if (!result.ok) throw new Error(result.error);
    return { ok: true, status: result.status };
  }

  return {
    setup: () => store.loadSetup(),
    saveSetup: async (body) => {
      await requireMutate();
      return store.saveSetup(body);
    },
    jobs: () => store.listJobs(),
    createJob: async () => {
      await requireMutate();
      return store.createJobFromSetup();
    },
    getJob: (id) => store.getJob(id),
    saveJob: async (id, body) => {
      await requireMutate();
      return store.saveJob({ ...body, id });
    },
    deleteJob: async (id) => {
      await requireMutate();
      const ok = await store.deleteJob(id);
      return { ok };
    },
    duplicateJob: async (id) => {
      await requireMutate();
      return store.duplicateJob(id);
    },
    openExample: async () => {
      const status = await entitlement.evaluate();
      const existing = await store.getJob(EXAMPLE_JOB_ID);
      if (!status.canMutate) {
        if (existing) return { job: existing, errors: [] };
        expiredError(status);
      }
      return { job: await store.openExampleJob(), errors: [] };
    },
    restoreExample: async () => {
      await requireMutate();
      return { job: await store.restoreExampleJob(), errors: [] };
    },
    entitlement: () => entitlement.evaluate(),
    activateLicense: (license) => entitlement.activateLicense(license),
    connectTrial: async (body) => {
      const issued = await requestSignedTrial(licenseUrl, { ...body, machineId: entitlement.deviceId }, fetchImpl);
      if (!issued.ok) return issued;
      return entitlement.activateLicense(JSON.stringify(issued.license));
    },
    startCheckout: async () => {
      const status = await entitlement.evaluate();
      if (status.status === "paid") return { ok: true, alreadyPaid: true, status };
      if (status.status === "needs-activation") {
        return { ok: false, error: "Start your 7-day trial before purchasing.", code: "needs-activation" };
      }
      const issued = await requestCheckoutSession(
        licenseUrl,
        { ...checkoutRequestBody({ machineId: entitlement.deviceId }), channel: "web" },
        fetchImpl,
      );
      if (issued.alreadyPaid) {
        const refreshed = await refreshPaid();
        return { ...refreshed, alreadyPaid: true };
      }
      if (!issued.ok) {
        const error = new Error(issued.error || "Could not start checkout.");
        error.code = issued.code;
        throw error;
      }
      return { ok: true, url: issued.url, sessionId: issued.sessionId, opened: false };
    },
    refreshPurchase: () => refreshPaid(),
  };
}
