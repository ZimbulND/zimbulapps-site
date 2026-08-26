import { withComputed } from "./calculations.js";
import { DEFAULT_SETUP, EXAMPLE_JOB_ID, buildExampleJob } from "./sampleJob.js";
import { validateJob, validateSetup } from "./validate.js";
import { buildDuplicateJob, buildNewJob, summarize, withLineIds } from "./jobModel.js";

export function createMemoryAdapter(seed = {}) {
  const data = {
    setup: seed.setup ?? null,
    jobs: { ...(seed.jobs || {}) },
    entitlementState: seed.entitlementState ?? null,
    registration: seed.registration ?? null,
  };
  return {
    async get(key) {
      if (key === "jobs") return { ...data.jobs };
      return data[key];
    },
    async set(key, value) {
      if (key === "jobs") data.jobs = { ...(value || {}) };
      else data[key] = value;
    },
  };
}

export function createWebWorkbookStore(adapter) {
  async function ensure() {
    const setup = await adapter.get("setup");
    if (!setup) await adapter.set("setup", DEFAULT_SETUP);
    const jobs = (await adapter.get("jobs")) || {};
    if (!Object.keys(jobs).length) {
      const example = buildExampleJob();
      jobs[example.id] = stripComputed(example);
      await adapter.set("jobs", jobs);
    }
  }

  async function loadSetup() {
    await ensure();
    const raw = (await adapter.get("setup")) || DEFAULT_SETUP;
    const { setup } = validateSetup({ ...DEFAULT_SETUP, ...raw });
    return setup;
  }

  async function saveSetup(input) {
    const { setup, errors } = validateSetup(input);
    if (errors.length) return { setup, errors };
    await ensure();
    await adapter.set("setup", setup);
    return { setup, errors: [] };
  }

  async function listJobs() {
    await ensure();
    const jobs = (await adapter.get("jobs")) || {};
    return Object.values(jobs)
      .map((raw) => summarize(withComputed(raw)))
      .sort((a, b) => String(b.quoteDate || "").localeCompare(String(a.quoteDate || "")));
  }

  async function getJob(id) {
    await ensure();
    const jobs = (await adapter.get("jobs")) || {};
    const raw = jobs[id];
    if (!raw) return null;
    return withComputed(raw);
  }

  async function saveJob(input) {
    const { job, errors } = validateJob(input);
    if (errors.length) return { job: withComputed(job), errors };
    await ensure();
    if (!job.id) job.id = crypto.randomUUID();
    job.estimateLines = withLineIds(job.estimateLines);
    job.actualLines = withLineIds(job.actualLines);
    const jobs = (await adapter.get("jobs")) || {};
    jobs[job.id] = stripComputed(job);
    await adapter.set("jobs", jobs);
    return { job: await getJob(job.id), errors: [] };
  }

  async function deleteJob(id) {
    const jobs = (await adapter.get("jobs")) || {};
    if (!jobs[id]) return false;
    delete jobs[id];
    await adapter.set("jobs", jobs);
    return true;
  }

  async function openExampleJob() {
    await ensure();
    const existing = await getJob(EXAMPLE_JOB_ID);
    if (existing) return existing;
    await saveJob(buildExampleJob());
    return getJob(EXAMPLE_JOB_ID);
  }

  async function restoreExampleJob() {
    await ensure();
    await saveJob(buildExampleJob());
    return getJob(EXAMPLE_JOB_ID);
  }

  async function createJobFromSetup() {
    const setup = await loadSetup();
    const jobs = await listJobs();
    return saveJob(buildNewJob(setup, jobs));
  }

  async function duplicateJob(id) {
    const source = await getJob(id);
    if (!source) return { job: null, errors: ["Job not found."] };
    const jobs = await listJobs();
    const copy = buildDuplicateJob(source, jobs);
    delete copy.computed;
    return saveJob(copy);
  }

  return {
    adapter,
    ensure,
    loadSetup,
    saveSetup,
    listJobs,
    getJob,
    saveJob,
    deleteJob,
    openExampleJob,
    restoreExampleJob,
    createJobFromSetup,
    duplicateJob,
  };
}

function stripComputed(job) {
  const { computed, ...rest } = job;
  return rest;
}
