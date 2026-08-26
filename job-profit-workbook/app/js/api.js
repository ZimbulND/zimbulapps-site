import { isWebRuntime } from "./webRuntime.js";
import { createBrowserWebApi } from "./webApi.js";

export async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !Array.isArray(data.errors)) {
    throw new Error(data.error || "Something went wrong. Try again.");
  }
  return data;
}

const httpApi = {
  setup: () => request("/api/setup"),
  saveSetup: (body) => request("/api/setup", { method: "PUT", body }),
  jobs: () => request("/api/jobs"),
  createJob: () => request("/api/jobs", { method: "POST" }),
  getJob: (id) => request(`/api/jobs/${id}`),
  saveJob: (id, body) => request(`/api/jobs/${id}`, { method: "PUT", body }),
  deleteJob: (id) => request(`/api/jobs/${id}`, { method: "DELETE" }),
  duplicateJob: (id) => request(`/api/jobs/${id}/duplicate`, { method: "POST" }),
  openExample: () => request("/api/example-job"),
  restoreExample: () => request("/api/example-job/restore", { method: "POST" }),
  entitlement: () => request("/api/entitlement"),
  activateLicense: (license) => request("/api/entitlement/activate", { method: "POST", body: { license } }),
  connectTrial: (body) => request("/api/entitlement/connect", { method: "POST", body }),
  startCheckout: () => request("/api/entitlement/checkout", { method: "POST", body: {} }),
  refreshPurchase: (body = {}) =>
    request("/api/entitlement/refresh", {
      method: "POST",
      body: {
        name: body.name,
        email: body.email,
        businessName: body.businessName,
        mobile: body.mobile,
        consent: body.consent === true,
      },
    }),
};

function createLazyWebApi() {
  let pending;
  async function loaded() {
    if (!pending) pending = createBrowserWebApi();
    return pending;
  }
  const facade = {};
  for (const name of Object.keys(httpApi)) {
    facade[name] = async (...args) => {
      const inner = await loaded();
      return inner[name](...args);
    };
  }
  return facade;
}

export const api = isWebRuntime() ? createLazyWebApi() : httpApi;
