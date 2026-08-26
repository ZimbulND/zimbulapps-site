import { api } from "./api.js";
import { computeJob } from "/engine/calculations.js";
import { CATEGORIES, JOB_STATUSES } from "/engine/constants.js";
import { formatDate, money, percent, signedMoney, todayIso } from "/engine/format.js";
import { percentToRate, rateToPercent, toNumber } from "/engine/money.js";
import { buildCustomerQuote } from "/engine/quoteView.js";
import { OTHER_UNIT, UNIT_SUGGESTIONS, applyCategoryChange, burdenRateForCategory, shouldRebuildJobForm, unitSelectValue, unitStoredFromSelect } from "./fieldEvents.js";
import { confirmExampleRestore } from "./exampleJob.js";
import { BACKUP_GUIDANCE, confirmWorkbookRestore } from "./workbookBackup.js";
import { isWebRuntime } from "./webRuntime.js";
import {
  BROWSER_OPEN_HELP,
  CHECKOUT_IN_BROWSER,
  CHECKOUT_UNAVAILABLE_MESSAGE,
  DELAYED_MESSAGE,
  UNLOCKED_MESSAGE,
  isTrustedCheckoutUrl,
  licenseBannerModel,
  nextPollDecision,
} from "/engine/purchase.js";

const app = document.getElementById("app");

const state = {
  setup: null,
  jobs: [],
  job: null,
  snapshot: "",
  errors: [],
  flash: "",
  entitlement: { enabled: false, status: "unrestricted", canMutate: true, canBackup: true, message: "" },
  trialReg: { name: "", email: "", businessName: "", mobile: "", consent: false },
  purchase: { phase: "idle", url: null, opened: false },
};

let currentHash = location.hash || "#/";
let purchasePollTimer = null;
let purchasePollStartedAt = 0;
let purchasePollCancelled = false;
let webSaveTimer = null;

init().catch((error) => {
  app.innerHTML = `<div class="main"><div class="errors">${escapeHtml(error.message)}</div></div>`;
});

async function init() {
  await refreshLists();
  if (isWebRuntime() && new URLSearchParams(location.search).get("purchase") === "1") {
    try {
      await checkPurchaseStatus({ silent: true });
    } catch {
      // Stripe return; the purchase banner can check again.
    }
    history.replaceState(null, "", `${location.pathname}${location.hash || "#/"}`);
  }
  window.addEventListener("hashchange", onHashChange);
  window.addEventListener("beforeunload", (event) => {
    if (isDirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWebAutosave();
  });
  window.addEventListener("pagehide", () => flushWebAutosave());
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveCurrent();
    }
  });
  await route();
}

async function refreshLists() {
  state.setup = await api.setup();
  state.jobs = await api.jobs();
  try {
    state.entitlement = await api.entitlement();
  } catch {
    state.entitlement = { enabled: false, status: "unrestricted", canMutate: true, canBackup: true, message: "" };
  }
}

function isDirty() {
  if (!state.job) return false;
  return persistable(state.job) !== state.snapshot;
}

function persistable(job) {
  const { computed, ...rest } = job;
  return JSON.stringify(rest);
}

async function onHashChange() {
  const next = parseRoute();
  const stayingOnJob = Boolean(state.job && next.page === "jobs" && next.jobId === state.job.id);
  if (isDirty() && !stayingOnJob && !confirm("You have unsaved changes. Leave without saving?")) {
    history.replaceState(null, "", currentHash || "#/");
    return;
  }
  currentHash = location.hash;
  if (stayingOnJob) {
    state.errors = [];
    render(viewJob(next.tab));
    return;
  }
  state.errors = [];
  state.flash = "";
  await route();
}

function parseRoute() {
  const hash = (location.hash || "#/").replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  return {
    page: parts[0] || "start",
    jobId: parts[0] === "jobs" ? parts[1] || "" : "",
    tab: parts[2] || "estimate",
  };
}

async function route() {
  if (state.entitlement?.enabled && state.entitlement.status === "needs-activation") {
    render(viewTrialConnect());
    return;
  }
  const { page, jobId, tab } = parseRoute();

  if (page === "setup") {
    render(viewSetup());
    return;
  }
  if (page === "jobs" && !jobId) {
    await refreshLists();
    render(viewJobs());
    return;
  }
  if (page === "jobs" && jobId) {
    if (!state.job || state.job.id !== jobId || !isDirty()) {
      try {
        state.job = await api.getJob(jobId);
        state.snapshot = persistable(state.job);
      } catch (error) {
        render(layout(`<div class="errors">${escapeHtml(error.message)}</div>`));
        return;
      }
    }
    render(viewJob(tab));
    return;
  }

  await refreshLists();
  render(viewStart());
}

function render(html) {
  const x = window.scrollX;
  const y = window.scrollY;
  app.innerHTML = html;
  window.scrollTo(x, y);
}

app.addEventListener("input", onFieldInput);
app.addEventListener("change", onFieldInput);
app.addEventListener("click", onAction);

function onFieldInput(event) {
  const field = event.target.closest("[data-field]");
  if (!field) return;
  applyField(field);
  const { page, jobId, tab } = parseRoute();
  if (!(page === "jobs" && jobId && state.job)) return;
  state.flash = "";
  scheduleWebAutosave();
  if (shouldRebuildJobForm(event)) {
    render(viewJob(tab));
    return;
  }
  refreshLiveCalcs();
}

function refreshLiveCalcs() {
  const computed = computeJob(state.job);
  const flag = document.getElementById("unsaved-flag");
  if (flag) flag.hidden = !isDirty();

  for (const line of [...computed.estimateLines, ...computed.actualLines]) {
    setCalcText(line.id, "baseCost", money(line.baseCost));
    setCalcText(line.id, "laborBurden", money(line.laborBurden));
    setCalcText(line.id, "cost", money(line.cost));
  }

  setLive("workCost", money(computed.workCost));
  setLive("contingency", money(computed.contingency));
  setLive("totalEstimatedCost", money(computed.totalEstimatedCost));
  setLive("markup", money(computed.markup));
  setLive("recommendedPrice", money(computed.recommendedPrice));
  setLive("priceOverride", computed.hasOverride ? money(computed.quotedPrice) : "—");
  setLive("quotedPrice", money(computed.quotedPrice));
  setLive("salesTax", money(computed.salesTax));
  setLive("customerTotal", money(computed.customerTotal));
  setLive("expectedProfit", money(computed.expectedProfit));
  setLive("expectedMargin", percent(computed.expectedMargin));
  setLive("actualCost", money(computed.actualCost));
  setLive("actualProfit", money(computed.actualProfit));
  setLive("actualMargin", percent(computed.actualMargin));
}

function setCalcText(lineId, field, text) {
  document.querySelectorAll(`[data-calc-id="${lineId}"][data-calc-field="${field}"]`).forEach((el) => {
    el.textContent = text;
  });
}

function setLive(name, text) {
  document.querySelectorAll(`[data-live="${name}"]`).forEach((el) => {
    el.textContent = text;
  });
}

function currentTab() {
  return parseRoute().tab;
}

function applyField(field) {
  const path = field.dataset.field;
  const value = readValue(field);
  if (path.startsWith("trialReg.")) {
    setPath(state.trialReg, path.slice(9), value);
    return;
  }
  if (path.startsWith("setup.")) {
    setPath(state.setup, path.slice(6), value);
    return;
  }
  if (path.startsWith("job.")) {
    setPath(state.job, path.slice(4), value);
    return;
  }
  if (field.dataset.lineId) {
    const group = field.dataset.lineGroup;
    const line = (state.job[group] || []).find((item) => item.id === field.dataset.lineId);
    if (!line) return;
    if (field.dataset.lineKey === "unit") {
      line.unit =
        field.dataset.unitRole === "select"
          ? unitStoredFromSelect(field.value, line.unit)
          : String(field.value || "").trim();
      return;
    }
    line[field.dataset.lineKey] = value;
    if (field.dataset.lineKey === "category") {
      const updated = applyCategoryChange(line, value, state.job.laborBurdenRate);
      line.laborBurdenRate = updated.laborBurdenRate;
      line.unit = updated.unit;
    }
  }
}

function readValue(field) {
  const raw = field.value;
  const as = field.dataset.as;
  if (as === "boolean") return field.checked;
  if (as === "percent") return percentToRate(raw);
  if (as === "number") return toNumber(raw, 0);
  if (as === "money-or-empty") return String(raw).trim() === "" ? null : toNumber(raw, 0);
  return raw;
}

function setPath(object, path, value) {
  object[path] = value;
}

async function onAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  event.preventDefault();
  const action = button.dataset.action;
  const mutating = ["save-setup", "save-job", "new-job", "delete-job", "duplicate-job", "restore-example", "restore-workbook", "add-line", "remove-line", "copy-estimate"].includes(action);
  if (mutating && state.entitlement?.enabled && state.entitlement.canMutate === false) {
    state.errors = [state.entitlement.message || "Your trial has ended. Backup remains available."];
    rerender();
    return;
  }
  try {
    if (action === "save-setup") await saveSetup();
    if (action === "save-job") await saveCurrent();
    if (action === "new-job") await newJob();
    if (action === "delete-job") await deleteCurrent();
    if (action === "duplicate-job") await duplicateCurrent();
    if (action === "open-example") await openExample();
    if (action === "restore-example") await restoreExample();
    if (action === "backup-workbook") await backupWorkbook();
    if (action === "restore-workbook") restoreWorkbook();
    if (action === "install-license") installLicense();
    if (action === "connect-trial") await connectTrial();
    if (action === "buy-license" || action === "unlock-license") await startPurchase();
    if (action === "check-purchase") await checkPurchaseStatus();
    if (action === "dismiss-checkout") dismissCheckout();
    if (action === "add-line") addLine(button.dataset.group);
    if (action === "remove-line") removeLine(button.dataset.group, button.dataset.lineId);
    if (action === "copy-estimate") copyEstimateToActuals();
    if (action === "print-quote") window.print();
  } catch (error) {
    state.errors = [error.message];
    rerender();
  }
}

function rerender() {
  if (state.entitlement?.enabled && state.entitlement.status === "needs-activation") {
    render(viewTrialConnect());
    return;
  }
  const hash = location.hash || "#/";
  if (hash.includes("/setup")) render(viewSetup());
  else if (state.job && hash.includes("/jobs/")) render(viewJob(currentTab()));
  else if (hash.includes("/jobs")) render(viewJobs());
  else render(viewStart());
}

async function saveSetup() {
  const result = await api.saveSetup(state.setup);
  state.errors = result.errors || [];
  if (!state.errors.length) {
    state.setup = result.setup;
    state.flash = "Business setup saved.";
  }
  render(viewSetup());
}

async function saveCurrent({ silent = false } = {}) {
  if (!state.job) return;
  const result = await api.saveJob(state.job.id, state.job);
  state.errors = result.errors || [];
  if (!state.errors.length) {
    state.job = result.job;
    state.snapshot = persistable(state.job);
    if (!silent) state.flash = "Job saved.";
  } else if (result.job) {
    state.job = { ...state.job, computed: result.job.computed };
  }
  if (!silent) render(viewJob(currentTab()));
  else {
    const flag = document.getElementById("unsaved-flag");
    if (flag) flag.hidden = !isDirty();
  }
}

function scheduleWebAutosave() {
  if (!isWebRuntime() || !state.entitlement?.canMutate) return;
  if (webSaveTimer) clearTimeout(webSaveTimer);
  webSaveTimer = setTimeout(() => {
    webSaveTimer = null;
    flushWebAutosave();
  }, 600);
}

function flushWebAutosave() {
  if (webSaveTimer) {
    clearTimeout(webSaveTimer);
    webSaveTimer = null;
  }
  if (!isWebRuntime() || !state.job || !isDirty() || !state.entitlement?.canMutate) return;
  saveCurrent({ silent: true }).catch(() => {});
}

async function newJob() {
  if (isDirty() && !confirm("You have unsaved changes. Leave without saving?")) return;
  const result = await api.createJob();
  if (result.errors?.length) {
    state.errors = result.errors;
    rerender();
    return;
  }
  state.job = result.job;
  state.snapshot = persistable(result.job);
  location.hash = `#/jobs/${result.job.id}/estimate`;
}

async function deleteCurrent() {
  if (!state.job) return;
  if (!confirm("Delete this job? This cannot be undone.")) return;
  await api.deleteJob(state.job.id);
  state.job = null;
  state.snapshot = "";
  location.hash = "#/jobs";
}

async function duplicateCurrent() {
  if (!state.job) return;
  if (isDirty() && !confirm("Duplicate the last saved version? Unsaved edits will not be copied.")) return;
  const result = await api.duplicateJob(state.job.id);
  state.job = result.job;
  state.snapshot = persistable(result.job);
  location.hash = `#/jobs/${result.job.id}/estimate`;
}

async function openExample() {
  const result = await api.openExample();
  state.job = result.job;
  state.snapshot = persistable(result.job);
  state.errors = [];
  location.hash = `#/jobs/${result.job.id}/review`;
}

async function restoreExample() {
  if (!confirmExampleRestore()) return;
  const result = await api.restoreExample();
  state.job = result.job;
  state.snapshot = persistable(result.job);
  state.errors = [];
  location.hash = `#/jobs/${result.job.id}/review`;
}

async function backupWorkbook() {
  const res = await fetch("/api/backup");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not create a backup.");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const name = match ? match[1] : "job-profit-workbook-backup.zip";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
  state.errors = [];
  state.flash = "Backup saved to your downloads.";
  rerender();
}

function restoreWorkbook() {
  const input = document.getElementById("workbook-restore-file");
  if (!input) throw new Error("Could not open a backup file.");
  input.value = "";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!confirmWorkbookRestore()) return;
    try {
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: await file.arrayBuffer(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "That file is not a Job Profit Workbook backup.");
      }
      state.job = null;
      state.snapshot = "";
      state.errors = [];
      state.flash = "Workbook restored from backup.";
      await refreshLists();
      const route = parseRoute();
      if (route.page === "jobs" && route.jobId) {
        location.hash = "#/jobs";
        return;
      }
      rerender();
    } catch (error) {
      state.errors = [error.message];
      state.flash = "";
      rerender();
    }
  };
  input.click();
}

function addLine(group) {
  const category = "labor";
  state.job[group] = state.job[group] || [];
  state.job[group].push({
    id: crypto.randomUUID(),
    category,
    description: "",
    quantity: 0,
    unit: "hrs",
    unitCost: 0,
    laborBurdenRate: burdenRateForCategory(category, state.job.laborBurdenRate),
  });
  render(viewJob(currentTab()));
}

function removeLine(group, id) {
  state.job[group] = (state.job[group] || []).filter((line) => line.id !== id);
  render(viewJob(currentTab()));
}

function copyEstimateToActuals() {
  if ((state.job.actualLines || []).some((line) => line.description || line.quantity || line.unitCost)) {
    if (!confirm("Replace the actual cost lines with a copy of the estimate?")) return;
  }
  state.job.actualLines = (state.job.estimateLines || []).map((line) => ({
    ...line,
    id: crypto.randomUUID(),
  }));
  render(viewJob("actuals"));
}

function layout(content) {
  const business = state.setup?.businessName || "Set up your business";
  return `
    <header class="app-header">
      <a class="brand" href="#/">
        <strong>Job Profit Workbook</strong>
        <span>${escapeHtml(business)}</span>
      </a>
      <nav class="nav">
        <a href="#/" class="${navClass("")}">Start here</a>
        <a href="#/setup" class="${navClass("setup")}">Setup</a>
        <a href="#/jobs" class="${navClass("jobs")}">Jobs</a>
      </nav>
    </header>
    ${licenseBanner()}
    <main class="main">${messages()}${content}</main>
  `;
}

function licenseBanner() {
  const model = licenseBannerModel(state.entitlement, state.purchase);
  if (!model.show) return "";
  const classes = [
    "license-banner",
    model.expired ? "expired" : "",
    model.checkoutOpen ? "checkout" : "purchase",
  ].filter(Boolean).join(" ");
  if (model.checkoutOpen) {
    const openLink = model.checkoutUrl
      ? `<a class="btn gold" href="${escapeHtml(model.checkoutUrl)}" target="_blank" rel="noopener noreferrer">Open checkout page</a>`
      : "";
    const help = model.delayed
      ? DELAYED_MESSAGE
      : !model.opened && model.checkoutUrl
        ? `${CHECKOUT_IN_BROWSER} ${BROWSER_OPEN_HELP}`
        : CHECKOUT_IN_BROWSER;
    return `<div class="${classes}">
      <p>${escapeHtml(help)}</p>
      <div class="actions">
        ${openLink}
        <button class="btn" data-action="check-purchase">Check purchase status</button>
        <button class="btn secondary" data-action="dismiss-checkout">Close this message</button>
      </div>
    </div>`;
  }
  const buy = model.action
    ? `<button class="btn gold" data-action="${escapeHtml(model.action.id)}">${escapeHtml(model.action.label)}</button>`
    : "";
  const backup = model.backup && !isWebRuntime()
    ? `<button class="btn secondary" data-action="backup-workbook">Backup workbook</button>`
    : "";
  const install = model.expired && !isWebRuntime()
    ? `<button class="btn secondary" data-action="install-license">Install license file</button>`
    : "";
  const help = isWebRuntime()
    ? "One-time purchase. No subscription. License is for this phone browser."
    : model.help;
  return `<div class="${classes}">
    <div class="purchase-copy">
      <p>${escapeHtml(model.message)}</p>
      <p class="help">${escapeHtml(help)}</p>
    </div>
    <div class="actions">${backup}${buy}${install}</div>
  </div>`;
}

function viewTrialConnect() {
  const t = state.trialReg;
  const fields = `
        <div class="form-grid">
          ${textField("trialReg.name", "Name", t.name, { wide: true })}
          ${textField("trialReg.email", "Email", t.email, { type: "email" })}
          ${textField("trialReg.businessName", "Business name (optional)", t.businessName)}
          ${textField("trialReg.mobile", "Mobile phone (optional)", t.mobile, { type: "tel" })}
          <label class="wide consent">
            <input data-field="trialReg.consent" data-as="boolean" type="checkbox"${t.consent ? " checked" : ""} />
            ${
              isWebRuntime()
                ? "I understand this is a 7-day free trial."
                : "I understand this is a 7-day trial, there is no automatic charge, and my job and customer data stay on this computer."
            }
          </label>
        </div>`;
  const webBody = `
        <h1>Start Your 7-Day Free Trial</h1>
        <p class="lede">No credit card required. Start using Job Profit Workbook now.</p>
        ${fields}
        <div class="actions">
          <button class="btn gold" data-action="connect-trial">Start My 7-Day Free Trial</button>
        </div>`;
  const desktopBody = `
        <h1>Start your 7-day free trial</h1>
        <p class="lede">No credit card. No automatic charge. Your job and customer data stay on this computer.</p>
        <p>After 7 days, Job Profit Workbook is $199 one time.</p>
        ${fields}
        <div class="actions">
          <button class="btn gold" data-action="connect-trial">Connect once and start trial</button>
        </div>
        <p class="help">This computer only needs to connect once. After that you can use the workbook without the internet.</p>
        <div class="trial-connect-license">
          <button class="btn secondary" data-action="install-license">Install license file</button>
          <p class="help">If you already received a license file for this computer, install it here instead of starting a trial.</p>
        </div>`;
  return `
    <header class="app-header">
      <a class="brand" href="#/">
        <strong>Job Profit Workbook</strong>
        <span>7-day trial</span>
      </a>
    </header>
    <main class="main">
      ${messages()}
      <section class="card trial-connect">
        ${isWebRuntime() ? webBody : desktopBody}
      </section>
    </main>
  `;
}

async function connectTrial() {
  const result = await api.connectTrial({
    name: state.trialReg.name,
    email: state.trialReg.email,
    businessName: state.trialReg.businessName,
    mobile: state.trialReg.mobile,
    consent: state.trialReg.consent === true,
  });
  if (!result.ok) throw new Error(result.error || "Could not start the trial.");
  state.entitlement = result.status || (await api.entitlement());
  state.errors = [];
  state.flash = isWebRuntime()
    ? "Your 7-day trial is active."
    : "Your 7-day trial is active. Your jobs stay on this computer.";
  await refreshLists();
  await route();
}

function stopPurchasePoll() {
  purchasePollCancelled = true;
  if (purchasePollTimer) {
    clearTimeout(purchasePollTimer);
    purchasePollTimer = null;
  }
}

function startPurchasePoll() {
  stopPurchasePoll();
  purchasePollCancelled = false;
  purchasePollStartedAt = Date.now();
  state.purchase.phase = "polling";
  schedulePurchasePoll();
}

function schedulePurchasePoll() {
  const decision = nextPollDecision({
    startedAt: purchasePollStartedAt,
    now: Date.now(),
    paid: state.entitlement?.status === "paid",
    cancelled: purchasePollCancelled,
  });
  if (!decision.continue) {
    if (decision.reason === "timeout" && state.entitlement?.status !== "paid") {
      state.purchase.phase = "delayed";
      rerender();
    }
    return;
  }
  purchasePollTimer = setTimeout(async () => {
    if (purchasePollCancelled || state.entitlement?.status === "paid") return;
    try {
      await checkPurchaseStatus({ silent: true });
    } catch {
      // Keep polling. Delayed fulfillment is not a failed payment.
    }
    if (purchasePollCancelled || state.entitlement?.status === "paid") return;
    schedulePurchasePoll();
  }, decision.waitMs);
}

async function startPurchase() {
  if (state.purchase.phase === "starting") return;
  stopPurchasePoll();
  state.purchase = { phase: "starting", url: null, opened: false };
  state.errors = [];
  rerender();
  try {
    const result = await api.startCheckout();
    if (result.status?.status === "paid") {
      await unlockPaid(result.status);
      return;
    }
    if (result.alreadyPaid) {
      await checkPurchaseStatus();
      return;
    }
    if (!isTrustedCheckoutUrl(result.url)) {
      throw new Error(CHECKOUT_UNAVAILABLE_MESSAGE);
    }
    if (isWebRuntime()) {
      window.location.assign(result.url);
      return;
    }
    if (!result.opened) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    }
    state.purchase = { phase: "checkout", url: result.url, opened: Boolean(result.opened) };
    state.errors = [];
    rerender();
    startPurchasePoll();
  } catch (error) {
    stopPurchasePoll();
    state.purchase = { phase: "idle", url: null, opened: false };
    state.errors = [error.message || CHECKOUT_UNAVAILABLE_MESSAGE];
    rerender();
  }
}

async function checkPurchaseStatus({ silent = false } = {}) {
  try {
    const result = await api.refreshPurchase({
      name: state.trialReg.name,
      email: state.trialReg.email,
      businessName: state.trialReg.businessName,
      mobile: state.trialReg.mobile,
      consent: state.trialReg.consent === true,
    });
    if (result.status?.status === "paid") {
      await unlockPaid(result.status);
      return;
    }
    if (result.status) state.entitlement = result.status;
    if (!silent) {
      state.purchase = { ...state.purchase, phase: "delayed" };
      state.errors = [];
      rerender();
    }
  } catch (error) {
    if (silent) throw error;
    state.purchase = { ...state.purchase, phase: "delayed" };
    state.errors = [error.message || DELAYED_MESSAGE];
    rerender();
  }
}

async function unlockPaid(status) {
  stopPurchasePoll();
  state.entitlement = status;
  state.purchase = { phase: "idle", url: null, opened: false };
  state.errors = [];
  state.flash = UNLOCKED_MESSAGE;
  await refreshLists();
  rerender();
}

function dismissCheckout() {
  stopPurchasePoll();
  state.purchase = { phase: "idle", url: null, opened: false };
  state.errors = [];
  rerender();
}

function installLicense() {
  const input = document.getElementById("license-file");
  if (!input) throw new Error("Could not open a license file.");
  input.value = "";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await api.activateLicense(text);
      if (!result.ok) throw new Error(result.error || "That license file is not valid.");
      state.entitlement = result.status || (await api.entitlement());
      state.errors = [];
      state.flash = "This computer is licensed. Your workbook is unchanged.";
      rerender();
    } catch (error) {
      state.errors = [error.message];
      rerender();
    }
  };
  input.click();
}

function navClass(part) {
  const hash = location.hash || "#/";
  if (part === "" && (hash === "#/" || hash === "#" || hash === "")) return "active";
  if (part === "setup" && hash.startsWith("#/setup")) return "active";
  if (part === "jobs" && hash.startsWith("#/jobs")) return "active";
  return "";
}

function messages() {
  let html = "";
  if (state.flash) html += `<div class="flash">${escapeHtml(state.flash)}</div>`;
  if (state.errors.length) {
    html += `<div class="errors"><strong>Please fix:</strong><ul>${state.errors
      .map((error) => `<li>${escapeHtml(error)}</li>`)
      .join("")}</ul></div>`;
  }
  return html;
}

function viewStart() {
  const completed = state.jobs.filter((job) => job.hasActuals);
  return layout(`
    <section class="hero">
      <h1>Estimate the job. Quote the customer. See where the profit went.</h1>
      <p class="lede">
        This workbook is for small contractors who need a clear number before they bid,
        a clean quote for the customer, and an honest look at what the job actually made.
        Internal costs stay on your side of the book. The customer quote never shows them.
      </p>
      <ol class="workflow">
        <li><strong>1. Estimate</strong><span>Build the job cost, then a recommended price.</span></li>
        <li><strong>2. Quote</strong><span>Print a customer-facing price. No internals.</span></li>
        <li><strong>3. Actual costs</strong><span>Record what labor and materials really ran.</span></li>
        <li><strong>4. Profit review</strong><span>Compare estimate vs actual, by category.</span></li>
        <li><strong>5. Learn</strong><span>Write the lesson and copy it into the next estimate.</span></li>
      </ol>
      <div class="legend">
        <div><span class="swatch input"></span> Yellow cells are yours to type.</div>
        <div><span class="swatch calc"></span> Gray cells are calculated. You cannot edit them.</div>
      </div>
      <p class="help">${isWebRuntime() ? "Your jobs stay in this browser on this phone. Closing the tab does not restart your 7-day trial." : escapeHtml(BACKUP_GUIDANCE)}</p>
      <div class="actions">
        <a class="btn" href="#/setup">Set up your business</a>
        <button class="btn gold" data-action="new-job">Start a new job</button>
        <button class="btn secondary" data-action="open-example">Open the example job</button>
        ${isWebRuntime() ? "" : `<button class="btn secondary" data-action="backup-workbook">Backup workbook</button>`}
      </div>
    </section>
    ${completed.length ? historyCard(completed) : ""}
  `);
}

function historyCard(jobs) {
  return `
    <section class="card">
      <h2>Recent jobs — what you learned</h2>
      <p class="help">Expected margin vs actual margin. This is the learning loop: which estimates were tight, and which leaked.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Customer</th>
              <th class="num">Quoted</th>
              <th class="num">Expected margin</th>
              <th class="num">Actual margin</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            ${jobs
              .map(
                (job) => `
              <tr>
                <td><a href="#/jobs/${job.id}/review">${escapeHtml(job.jobName || job.jobNumber)}</a></td>
                <td>${escapeHtml(job.customerName || "—")}</td>
                <td class="num">${money(job.quotedPrice)}</td>
                <td class="num">${percent(job.expectedMargin)}</td>
                <td class="num">${percent(job.actualMargin)}</td>
                <td>${pill(job.profitability)}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function viewSetup() {
  const s = state.setup;
  return layout(`
    <section class="hero">
      <h1>Business setup</h1>
      <p class="lede">These defaults land on every new job. Changing them later does not rewrite jobs you already saved.</p>
    </section>
    <section class="card">
      <div class="form-grid">
        ${textField("setup.businessName", "Business name", s.businessName, { wide: true })}
        ${textField("setup.contactName", "Contact name", s.contactName)}
        ${textField("setup.phone", "Phone", s.phone)}
        ${textField("setup.email", "Email", s.email)}
        ${textField("setup.website", "Website", s.website)}
        ${textField("setup.address", "Business address", s.address, { wide: true })}
        ${textField("setup.licenseNumber", "License number", s.licenseNumber)}
        ${textField("setup.insuranceNote", "Insurance note", s.insuranceNote)}
        ${percentField("setup.defaultMarkupRate", "Default markup", s.defaultMarkupRate, "Added on top of estimated cost to set the recommended price. 30% markup is about 23% margin.")}
        ${percentField("setup.salesTaxRate", "Sales tax rate", s.salesTaxRate, "Applied to the quoted price, not to profit. Use 0% if you do not collect tax.")}
        ${percentField("setup.contingencyRate", "Contingency rate", s.contingencyRate, "A buffer added to estimated cost before markup, for things you cannot see yet.")}
        ${percentField("setup.defaultLaborBurdenRate", "Default labor burden", s.defaultLaborBurdenRate, "Payroll taxes, workers comp, and similar costs on labor. Applied to labor lines.")}
        ${numberField("setup.quoteValidityDays", "Quote validity (days)", s.quoteValidityDays)}
        <label class="wide">Quote terms
          <textarea data-field="setup.quoteTerms">${escapeHtml(s.quoteTerms)}</textarea>
          <p class="help">Printed on the customer quote. Keep it short and plain.</p>
        </label>
      </div>
      <div class="actions">
        <button class="btn" data-action="save-setup">Save setup</button>
      </div>
    </section>
    ${
      isWebRuntime()
        ? ""
        : `<section class="card setup-backup">
      <h2>Backup and restore</h2>
      <p class="help">${escapeHtml(BACKUP_GUIDANCE)}</p>
      <div class="actions">
        <button class="btn" data-action="backup-workbook">Backup workbook</button>
        <button class="btn secondary" data-action="restore-workbook">Restore workbook</button>
      </div>
    </section>`
    }
  `);
}

function viewJobs() {
  return layout(`
    <div class="job-bar">
      <div>
        <h1>Jobs</h1>
        <p class="help">Each job is its own estimate, quote, actual costs, and profit review.</p>
      </div>
      <div class="actions">
        <button class="btn" data-action="new-job">New job</button>
        <button class="btn secondary" data-action="restore-example">Restore example job</button>
      </div>
    </div>
    <section class="card">
      ${
        state.jobs.length === 0
          ? `<p class="empty">No jobs yet. Start a new job or open the example.</p>`
          : `<div class="table-wrap"><table class="jobs-table">
        <thead>
          <tr>
            <th>Number</th>
            <th>Job</th>
            <th>Customer</th>
            <th>Status</th>
            <th class="num">Quote</th>
            <th class="num">Expected profit</th>
            <th class="num">Actual profit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.jobs
            .map(
              (job) => `
            <tr>
              <td>${escapeHtml(job.jobNumber || "—")}${job.isExample ? ' <span class="pill example">Example</span>' : ""}</td>
              <td><a href="#/jobs/${job.id}/estimate">${escapeHtml(job.jobName || "Untitled job")}</a></td>
              <td>${escapeHtml(job.customerName || "—")}</td>
              <td>${escapeHtml(statusLabel(job.status))}</td>
              <td class="num">${money(job.quotedPrice)}</td>
              <td class="num">${money(job.expectedProfit)}</td>
              <td class="num">${job.hasActuals ? money(job.actualProfit) : "—"}</td>
              <td>${pill(job.profitability)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table></div>`
      }
    </section>
  `);
}

function viewJob(tab) {
  const job = state.job;
  const computed = computeJob(job);
  const tabs = [
    ["estimate", "Estimate"],
    ["quote", "Customer quote"],
    ["actuals", "Actual costs"],
    ["review", "Profit review"],
  ];
  const body =
    tab === "quote"
      ? viewQuote(job, computed)
      : tab === "actuals"
        ? viewActuals(job, computed)
        : tab === "review"
          ? viewReview(job, computed)
          : viewEstimate(job, computed);

  return layout(`
    <div class="job-bar no-print">
      <div>
        <p class="crumb"><a href="#/jobs">All jobs</a></p>
        <h1>${escapeHtml(job.jobName || "Untitled job")}</h1>
        <p class="meta">${escapeHtml(job.jobNumber || "")}${job.customerName ? " · " + escapeHtml(job.customerName) : ""}</p>
      </div>
      <div class="save-cluster">
        <span class="dirty" id="unsaved-flag" ${isDirty() ? "" : "hidden"}>Unsaved changes</span>
        <button class="btn" data-action="save-job">Save job</button>
      </div>
    </div>
    <nav class="job-tabs no-print">
      ${tabs
        .map(
          ([id, label]) =>
            `<a class="${tab === id ? "active" : ""}" href="#/jobs/${job.id}/${id}">${label}</a>`,
        )
        .join("")}
    </nav>
    ${body}
  `);
}

function viewEstimate(job, computed) {
  return `
    <div class="grid-2 estimate-screen">
      <div>
        <section class="card job-info-card">
          <h2>Job information</h2>
          <div class="form-grid job-info-grid">
            ${textField("job.jobNumber", "Job / quote number", job.jobNumber)}
            ${selectField("job.status", "Status", job.status, JOB_STATUSES)}
            ${textField("job.jobName", "Job name", job.jobName, { span: 2 })}
            ${textField("job.customerName", "Customer", job.customerName)}
            ${textField("job.customerPhone", "Customer phone", job.customerPhone)}
            ${textField("job.customerEmail", "Customer email", job.customerEmail)}
            ${textField("job.quoteDate", "Quote date", job.quoteDate || todayIso(), { type: "date" })}
            ${textField("job.jobAddress", "Job address", job.jobAddress, { wide: true })}
            <label class="wide">Scope summary
              <textarea data-field="job.scopeSummary">${escapeHtml(job.scopeSummary)}</textarea>
              <p class="help">This text prints on the customer quote. Do not put costs or markup here.</p>
            </label>
          </div>
        </section>
        <section class="rates-strip">
          <h2>This job’s rates</h2>
          <p class="help">Copied from Setup when the job was created. Change them here if this job is different. Percents are entered as 30 for 30%.</p>
          <div class="rates">
            ${percentField("job.markupRate", "Markup", job.markupRate, "")}
            ${percentField("job.contingencyRate", "Contingency", job.contingencyRate, "")}
            ${percentField("job.salesTaxRate", "Sales tax", job.salesTaxRate, "")}
            ${percentField("job.laborBurdenRate", "Labor burden", job.laborBurdenRate, "")}
            ${numberField("job.quoteValidityDays", "Quote validity (days)", job.quoteValidityDays)}
            ${textField("job.priceOverride", "Price override (optional)", job.priceOverride ?? "", { as: "money-or-empty" })}
          </div>
          <p class="help">Labor burden is the default for new Labor lines and when you change a line’s category. It does not rewrite existing line Burden % values. Price override: leave blank to use the recommended price. Use this to round the bid or match a number you already promised.</p>
        </section>
        <section class="card primary-work">
          <h2>Estimated costs</h2>
          <div class="legend inline">
            <span><i class="swatch work"></i> Yours to type</span>
            <span><i class="swatch calc"></i> Calculated</span>
          </div>
          ${lineEditor(job.estimateLines, "estimateLines", computed.estimateLines)}
          <div class="actions">
            <button class="btn secondary" data-action="add-line" data-group="estimateLines">Add line</button>
          </div>
        </section>
      </div>
      ${summaryCard(computed, "estimate")}
    </div>
  `;
}

function viewActuals(job, computed) {
  return `
    <div class="grid-2 actuals-screen">
      <div>
        <section class="card primary-work">
          <h2>Actual costs</h2>
          <p class="help">Enter what the job really cost after you finished. Labor burden uses the same method as the estimate. Contingency is not added to actuals — it was only a planning buffer.</p>
          <div class="actions actuals-toolbar">
            <button class="btn secondary" data-action="copy-estimate">Copy estimate lines to start from</button>
          </div>
          <div class="legend inline">
            <span><i class="swatch work"></i> Yours to type</span>
            <span><i class="swatch calc"></i> Calculated</span>
          </div>
          ${lineEditor(job.actualLines, "actualLines", computed.actualLines)}
          <div class="actions">
            <button class="btn secondary" data-action="add-line" data-group="actualLines">Add line</button>
          </div>
        </section>
      </div>
      ${summaryCard(computed, "actuals")}
    </div>
  `;
}

function viewQuote(job, computed) {
  const q = buildCustomerQuote(job, state.setup, computed);
  return `
    <div class="quote-screen">
      <div class="internal-note no-print">
        This is the customer-facing quote. Estimated cost, markup, burden, and profit are hidden. Print or save PDF from your browser.
      </div>
      <div class="actions quote-toolbar no-print">
        <button class="btn" data-action="print-quote">Print / save PDF</button>
      </div>
      <article class="quote-sheet">
        <div class="quote-head">
          <div class="quote-identity">
            <h1>${escapeHtml(q.businessName || "Your business name")}</h1>
            <div>${escapeHtml(q.contactName)}</div>
            <div>${escapeHtml(q.address)}</div>
            <div>${escapeHtml(q.phone)}${q.email ? " · " + escapeHtml(q.email) : ""}</div>
            ${q.licenseNumber ? `<div>License ${escapeHtml(q.licenseNumber)}</div>` : ""}
            ${q.insuranceNote ? `<div>${escapeHtml(q.insuranceNote)}</div>` : ""}
          </div>
          <div class="quote-meta">
            <strong>Quote</strong><br />
            ${escapeHtml(q.jobNumber || "")}<br />
            ${formatDate(q.quoteDate)}<br />
            Valid through ${formatDate(q.validUntil)}
          </div>
        </div>
        <p class="quote-party"><strong>Prepared for</strong><br />
          ${escapeHtml(q.customerName || "—")}<br />
          ${escapeHtml(q.jobName || "")}<br />
          ${escapeHtml(q.jobAddress || "")}
        </p>
        <h2>Scope of work</h2>
        <p>${escapeHtml(q.scopeSummary || "No scope has been written yet.")}</p>
        ${
          q.includedWork.length
            ? `<h3>Included</h3><ul class="included">${q.includedWork
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join("")}</ul>`
            : ""
        }
        <div class="totals-box">
          <div class="metric"><span>Quote amount</span><strong>${money(q.quotedPrice)}</strong></div>
          <div class="metric"><span>Sales tax (${percent(q.salesTaxRate, 2)})</span><strong>${money(q.salesTax)}</strong></div>
          <div class="metric total"><span>Total</span><strong>${money(q.customerTotal)}</strong></div>
        </div>
        <h3>Terms</h3>
        <p>${escapeHtml(q.terms || "")}</p>
        <p class="help">This quote is valid through ${formatDate(q.validUntil)} (${q.quoteValidityDays} days from the quote date).</p>
        <div class="accept">
          <div>
            <div class="sign-line">Customer signature</div>
          </div>
          <div>
            <div class="sign-line">Date</div>
          </div>
        </div>
      </article>
    </div>
  `;
}

function viewReview(job, computed) {
  const status = computed.profitability;
  const titles = {
    held: "This job held its profit.",
    below_estimate: "This job made money, but less than you estimated.",
    loss: "This job lost money.",
    incomplete: "Enter actual costs to see how the job really did.",
  };
  const maxAbs = Math.max(
    ...computed.categoryTotals.map((row) => Math.max(row.estimated, row.actual)),
    1,
  );
  return `
    <div class="review-screen">
      <section class="banner review-verdict ${status}">
        <h2>${titles[status]}</h2>
        ${
          computed.hasActuals
            ? `<p>Quoted ${money(computed.quotedPrice)} before tax. Estimated cost ${money(computed.totalEstimatedCost)}. Actual cost ${money(computed.actualCost)}. Actual profit ${money(computed.actualProfit)} (${percent(computed.actualMargin)}).</p>`
            : `<p>Finish the job, then record actual costs. The quote amount stays the same; only costs change the profit.</p>`
        }
      </section>
      <p class="ticket-kicker review-kicker">Compared with the estimate</p>
      <div class="kpis review-kpis">
        <div class="kpi emphasis"><span>Actual profit</span><strong class="${computed.actualProfit < 0 ? "loss" : "profit"}">${money(computed.actualProfit)}</strong></div>
        <div class="kpi emphasis"><span>Actual margin</span><strong class="${computed.actualProfit < 0 ? "loss" : "profit"}">${percent(computed.actualMargin)}</strong></div>
        <div class="kpi emphasis"><span>Cost variance</span><strong class="${computed.costVarianceVsEstimate > 0 ? "loss" : "profit"}">${signedMoney(computed.costVarianceVsEstimate)}</strong><span class="help">${computed.costVarianceVsEstimate > 0 ? "over estimate" : computed.costVarianceVsEstimate < 0 ? "under estimate" : "on estimate"}</span></div>
        <div class="kpi quiet"><span>Estimated cost</span><strong>${money(computed.totalEstimatedCost)}</strong></div>
        <div class="kpi quiet"><span>Actual cost</span><strong>${money(computed.actualCost)}</strong></div>
        <div class="kpi quiet"><span>Expected profit</span><strong>${money(computed.expectedProfit)}</strong></div>
        <div class="kpi quiet"><span>Expected margin</span><strong>${percent(computed.expectedMargin)}</strong></div>
        <div class="kpi quiet"><span>Profit variance</span><strong class="${computed.profitVariance < 0 ? "loss" : "profit"}">${signedMoney(computed.profitVariance)}</strong></div>
        <div class="kpi quiet"><span>Work cost vs actual</span><strong>${signedMoney(computed.costVarianceVsWork)}</strong><span class="help">before contingency</span></div>
      </div>
      <section class="card review-movement">
        <h2>Where the money moved</h2>
        ${
          computed.largestOverrun
            ? `<p class="review-overrun"><strong>Largest cost overrun:</strong> ${escapeHtml(computed.largestOverrun.label)} ran ${money(computed.largestOverrun.amount)} over the estimate.</p>`
            : `<p class="review-overrun">No category ran over the estimate.</p>`
        }
        <p class="help">Contingency included in the estimate was ${money(computed.contingency)}. ${
          computed.overrunPastContingency > 0
            ? `Actual cost still exceeded the full estimate by ${money(computed.overrunPastContingency)}.`
            : `Unused contingency: ${money(computed.unusedContingency)}.`
        }</p>
        <div class="table-wrap">
          <table class="review-table">
            <thead>
              <tr>
                <th>Category</th>
                <th class="num">Estimated</th>
                <th class="num">Actual</th>
                <th class="num">Variance</th>
                <th>Mix</th>
              </tr>
            </thead>
            <tbody>
              ${computed.categoryTotals
                .map(
                  (row) => `
                <tr>
                  <td>${escapeHtml(row.label)}</td>
                  <td class="num">${money(row.estimated)}</td>
                  <td class="num">${money(row.actual)}</td>
                  <td class="num ${row.variance > 0 ? "loss" : row.variance < 0 ? "profit" : ""}">${signedMoney(row.variance)}</td>
                  <td>
                    <div class="bar" title="Estimated"><i style="width:${(row.estimated / maxAbs) * 100}%"></i></div>
                    <div class="bar" title="Actual"><i class="${row.variance > 0 ? "over" : ""}" style="width:${(row.actual / maxAbs) * 100}%"></i></div>
                  </td>
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card review-lesson">
        <h2>Lesson for the next estimate</h2>
        <label>What would you change next time?
          <textarea class="work-cell" data-field="job.lessonsLearned">${escapeHtml(job.lessonsLearned)}</textarea>
        </label>
        <div class="actions">
          <button class="btn" data-action="save-job">Save job</button>
          <button class="btn secondary" data-action="duplicate-job">Copy estimate into a new job</button>
          <button class="btn danger" data-action="delete-job">Delete job</button>
        </div>
      </section>
      ${howTheNumbersWork()}
    </div>
  `;
}

function summaryCard(computed, mode) {
  if (mode === "actuals") {
    return `
    <aside class="summary-card price-ticket" id="job-summary">
      <h2>Job result so far</h2>
      <div class="hero-label">Actual cost</div>
      <div class="hero-price" data-live="actualCost">${money(computed.actualCost)}</div>
      <div class="hero-pair">
        <div>
          <div class="hero-label">Actual profit</div>
          <strong class="${computed.actualProfit < 0 ? "loss" : "profit"}" data-live="actualProfit">${money(computed.actualProfit)}</strong>
        </div>
        <div>
          <div class="hero-label">Actual margin</div>
          <strong data-live="actualMargin">${percent(computed.actualMargin)}</strong>
        </div>
      </div>
      <div class="ticket-internal">
        <p class="ticket-kicker">Compared with the estimate</p>
        <div class="metric"><span class="muted">Work cost</span><span data-live="workCost">${money(computed.workCost)}</span></div>
        <div class="metric"><span class="muted">Contingency</span><span data-live="contingency">${money(computed.contingency)}</span></div>
        <div class="metric"><span class="muted">Estimated cost</span><span data-live="totalEstimatedCost">${money(computed.totalEstimatedCost)}</span></div>
        <div class="metric"><span class="muted">Markup</span><span data-live="markup">${money(computed.markup)}</span></div>
        <div class="metric"><span class="muted">Recommended price</span><span data-live="recommendedPrice">${money(computed.recommendedPrice)}</span></div>
        <div class="metric"><span class="muted">Expected profit</span><span class="profit" data-live="expectedProfit">${money(computed.expectedProfit)}</span></div>
        <div class="metric"><span class="muted">Expected margin</span><span data-live="expectedMargin">${percent(computed.expectedMargin)}</span></div>
      </div>
      <div class="ticket-customer">
        <p class="ticket-kicker">What the customer sees</p>
        <div class="metric"><span class="muted">Price override</span><span data-live="priceOverride">${computed.hasOverride ? money(computed.quotedPrice) : "—"}</span></div>
        <div class="metric"><span class="muted">Quoted price</span><span data-live="quotedPrice">${money(computed.quotedPrice)}</span></div>
        <div class="metric"><span class="muted">Sales tax</span><span data-live="salesTax">${money(computed.salesTax)}</span></div>
        <div class="metric"><span>Customer total</span><strong data-live="customerTotal">${money(computed.customerTotal)}</strong></div>
        <p class="help">Sales tax is added for the customer total. It is not counted as profit.</p>
      </div>
      ${howTheNumbersWork()}
    </aside>
  `;
  }
  return `
    <aside class="summary-card price-ticket" id="job-summary">
      <h2>Your price</h2>
      <div class="hero-label">Recommended price</div>
      <div class="hero-price" data-live="recommendedPrice">${money(computed.recommendedPrice)}</div>
      <div class="hero-pair">
        <div>
          <div class="hero-label">Expected profit</div>
          <strong class="profit" data-live="expectedProfit">${money(computed.expectedProfit)}</strong>
        </div>
        <div>
          <div class="hero-label">Expected margin</div>
          <strong data-live="expectedMargin">${percent(computed.expectedMargin)}</strong>
        </div>
      </div>
      <div class="ticket-internal">
        <p class="ticket-kicker">How that price is built</p>
        <div class="metric"><span class="muted">Work cost</span><span data-live="workCost">${money(computed.workCost)}</span></div>
        <div class="metric"><span class="muted">Contingency</span><span data-live="contingency">${money(computed.contingency)}</span></div>
        <div class="metric"><span class="muted">Estimated cost</span><span data-live="totalEstimatedCost">${money(computed.totalEstimatedCost)}</span></div>
        <div class="metric"><span class="muted">Markup</span><span data-live="markup">${money(computed.markup)}</span></div>
      </div>
      <div class="ticket-customer">
        <p class="ticket-kicker">What the customer sees</p>
        <div class="metric"><span class="muted">Price override</span><span data-live="priceOverride">${computed.hasOverride ? money(computed.quotedPrice) : "—"}</span></div>
        <div class="metric"><span class="muted">Quoted price</span><span data-live="quotedPrice">${money(computed.quotedPrice)}</span></div>
        <div class="metric"><span class="muted">Sales tax</span><span data-live="salesTax">${money(computed.salesTax)}</span></div>
        <div class="metric"><span>Customer total</span><strong data-live="customerTotal">${money(computed.customerTotal)}</strong></div>
        <p class="help">Sales tax is added for the customer total. It is not counted as profit.</p>
      </div>
      ${howTheNumbersWork()}
    </aside>
  `;
}

function howTheNumbersWork() {
  return `
    <details class="how">
      <summary>How the numbers work</summary>
      <ol>
        <li>Base cost = quantity × unit cost</li>
        <li>Labor burden = base cost × labor burden rate (usually labor only)</li>
        <li>Line cost = base cost + labor burden</li>
        <li>Work cost = sum of estimated line costs</li>
        <li>Contingency = work cost × contingency rate</li>
        <li>Estimated cost = work cost + contingency</li>
        <li>Markup = estimated cost × markup rate</li>
        <li>Recommended price = estimated cost + markup</li>
        <li>Quoted price = override, or the recommended price</li>
        <li>Sales tax = quoted price × tax rate</li>
        <li>Customer total = quoted price + sales tax</li>
        <li>Expected profit = quoted price − estimated cost</li>
        <li>Actual profit = quoted price − actual cost</li>
        <li>Margin = profit ÷ quoted price</li>
      </ol>
    </details>
  `;
}

function unitControls(group, line) {
  const selected = unitSelectValue(line.unit);
  const isOther = selected === OTHER_UNIT;
  return `
    <div class="unit-stack">
      <select data-field="line" data-unit-role="select" data-line-group="${group}" data-line-id="${line.id}" data-line-key="unit">
        ${UNIT_SUGGESTIONS.map(
          (unit) =>
            `<option value="${escapeAttr(unit)}" ${selected === unit ? "selected" : ""}>${escapeHtml(unit)}</option>`,
        ).join("")}
        <option value="${OTHER_UNIT}" ${isOther ? "selected" : ""}>Other…</option>
      </select>
      <input class="work-cell" data-field="line" data-unit-role="custom" data-line-group="${group}" data-line-id="${line.id}" data-line-key="unit" ${isOther ? "" : "hidden"} value="${isOther ? escapeAttr(line.unit) : ""}" placeholder="custom unit" />
    </div>
  `;
}

function lineEditor(lines, group, computedLines) {
  return `
    <div class="line-editor">
      <div class="line-editor-desktop">${lineTable(lines, group, computedLines)}</div>
      <div class="line-editor-phone">${lineCards(lines, group, computedLines)}</div>
    </div>
  `;
}

function lineCards(lines, group, computedLines) {
  const computedById = Object.fromEntries((computedLines || []).map((line) => [line.id, line]));
  const cards = (lines || [])
    .map((line) => {
      const calc = computedById[line.id] || computeJob({ estimateLines: [line], laborBurdenRate: state.job.laborBurdenRate }).estimateLines[0];
      return `
        <article class="line-card">
          <div class="line-card-head">
            <strong data-calc-id="${line.id}" data-calc-field="cost">${money(calc.cost)}</strong>
            <button class="linkish remove" data-action="remove-line" data-group="${group}" data-line-id="${line.id}">Remove</button>
          </div>
          <label>Category
            <select data-field="line" data-line-group="${group}" data-line-id="${line.id}" data-line-key="category">
              ${CATEGORIES.map((c) => `<option value="${c.id}" ${line.category === c.id ? "selected" : ""}>${c.label}</option>`).join("")}
            </select>
          </label>
          <label>Description
            <input class="work-cell" data-field="line" data-line-group="${group}" data-line-id="${line.id}" data-line-key="description" value="${escapeAttr(line.description)}" />
          </label>
          <div class="line-card-row">
            <label>Qty / hours
              <input class="work-cell num" data-field="line" data-as="number" data-line-group="${group}" data-line-id="${line.id}" data-line-key="quantity" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(line.quantity)}" />
            </label>
            <label>Unit
              ${unitControls(group, line)}
            </label>
          </div>
          <div class="line-card-row">
            <label>Unit cost
              <input class="work-cell num" data-field="line" data-as="number" data-line-group="${group}" data-line-id="${line.id}" data-line-key="unitCost" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(line.unitCost)}" />
            </label>
            <label>Burden %
              <input class="work-cell num" data-field="line" data-as="percent" data-line-group="${group}" data-line-id="${line.id}" data-line-key="laborBurdenRate" type="number" min="0" step="0.1" inputmode="decimal" value="${escapeAttr(rateToPercent(line.laborBurdenRate))}" />
            </label>
          </div>
          <p class="help line-card-calcs">Base <span data-calc-id="${line.id}" data-calc-field="baseCost">${money(calc.baseCost)}</span> · Burden <span data-calc-id="${line.id}" data-calc-field="laborBurden">${money(calc.laborBurden)}</span></p>
        </article>`;
    })
    .join("");
  return cards || `<p class="empty">No lines yet.</p>`;
}

function lineTable(lines, group, computedLines) {
  const computedById = Object.fromEntries((computedLines || []).map((line) => [line.id, line]));
  const rows = (lines || [])
    .map((line) => {
      const calc = computedById[line.id] || computeJob({ estimateLines: [line], laborBurdenRate: state.job.laborBurdenRate }).estimateLines[0];
      return `
        <tr>
          <td class="col-cat">
            <select data-field="line" data-line-group="${group}" data-line-id="${line.id}" data-line-key="category">
              ${CATEGORIES.map((c) => `<option value="${c.id}" ${line.category === c.id ? "selected" : ""}>${c.label}</option>`).join("")}
            </select>
          </td>
          <td class="col-desc">
            <input class="work-cell" data-field="line" data-line-group="${group}" data-line-id="${line.id}" data-line-key="description" value="${escapeAttr(line.description)}" />
          </td>
          <td class="col-qty">
            <input class="work-cell num" data-field="line" data-as="number" data-line-group="${group}" data-line-id="${line.id}" data-line-key="quantity" type="number" min="0" step="0.01" value="${escapeAttr(line.quantity)}" />
          </td>
          <td class="col-unit">
            ${unitControls(group, line)}
          </td>
          <td class="col-money">
            <input class="work-cell num" data-field="line" data-as="number" data-line-group="${group}" data-line-id="${line.id}" data-line-key="unitCost" type="number" min="0" step="0.01" value="${escapeAttr(line.unitCost)}" />
          </td>
          <td class="col-pct">
            <input class="work-cell num" data-field="line" data-as="percent" data-line-group="${group}" data-line-id="${line.id}" data-line-key="laborBurdenRate" type="number" min="0" step="0.1" value="${escapeAttr(rateToPercent(line.laborBurdenRate))}" />
          </td>
          <td class="num cost col-calc" data-calc-id="${line.id}" data-calc-field="baseCost">${money(calc.baseCost)}</td>
          <td class="num cost col-calc" data-calc-id="${line.id}" data-calc-field="laborBurden">${money(calc.laborBurden)}</td>
          <td class="num cost col-cost"><strong data-calc-id="${line.id}" data-calc-field="cost">${money(calc.cost)}</strong></td>
          <td class="col-del"><button class="linkish remove" data-action="remove-line" data-group="${group}" data-line-id="${line.id}" title="Remove line">×</button></td>
        </tr>`;
    })
    .join("");

  return `
    <div class="table-wrap">
      <table class="line-table">
        <thead>
          <tr>
            <th class="col-cat">Category</th>
            <th class="col-desc">Description</th>
            <th class="num col-qty">Qty / hours</th>
            <th class="col-unit">Unit</th>
            <th class="num col-money">Unit cost</th>
            <th class="num col-pct">Burden %</th>
            <th class="num col-calc">Base cost</th>
            <th class="num col-calc">Burden $</th>
            <th class="num col-cost">Cost</th>
            <th class="col-del"></th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="10" class="empty">No lines yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function fieldLabelClass(options = {}) {
  return [options.wide ? "wide" : "", options.span ? `span-${options.span}` : ""].filter(Boolean).join(" ");
}

function textField(field, label, value, options = {}) {
  const type = options.type || "text";
  const as = options.as ? ` data-as="${options.as}"` : "";
  return `<label class="${fieldLabelClass(options)}">${escapeHtml(label)}
    <input name="${escapeAttr(field)}" data-field="${escapeAttr(field)}"${as} type="${type}" value="${escapeAttr(value ?? "")}" />
    ${options.help ? `<p class="help">${escapeHtml(options.help)}</p>` : ""}
  </label>`;
}

function numberField(field, label, value, help) {
  return `<label>${escapeHtml(label)}
    <input data-field="${escapeAttr(field)}" data-as="number" type="number" min="0" step="1" value="${escapeAttr(value ?? 0)}" />
    ${help ? `<p class="help">${escapeHtml(help)}</p>` : ""}
  </label>`;
}

function percentField(field, label, rate, help) {
  const helpText = help === undefined ? "Enter as a percent, for example 30 for 30%." : help;
  return `<label>${escapeHtml(label)}
    <input data-field="${escapeAttr(field)}" data-as="percent" type="number" min="0" step="0.1" value="${escapeAttr(rateToPercent(rate))}" />
    ${helpText ? `<p class="help">${escapeHtml(helpText)}</p>` : ""}
  </label>`;
}

function selectField(field, label, value, options) {
  return `<label>${escapeHtml(label)}
    <select data-field="${escapeAttr(field)}">
      ${options.map((opt) => `<option value="${opt.id}" ${opt.id === value ? "selected" : ""}>${escapeHtml(opt.label)}</option>`).join("")}
    </select>
  </label>`;
}

function pill(status) {
  const labels = {
    held: "Held profit",
    below_estimate: "Profit, below estimate",
    loss: "Lost money",
    incomplete: "No actuals yet",
  };
  return `<span class="pill ${status}">${labels[status] || status}</span>`;
}

function statusLabel(id) {
  return JOB_STATUSES.find((item) => item.id === id)?.label || id;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
