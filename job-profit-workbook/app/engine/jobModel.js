import { withComputed } from "./calculations.js";
import { todayIso } from "./format.js";

export function emptyLine(category, laborBurdenRate) {
  return {
    id: crypto.randomUUID(),
    category,
    description: "",
    quantity: 0,
    unit: category === "labor" ? "hrs" : "ea",
    unitCost: 0,
    laborBurdenRate: category === "labor" ? laborBurdenRate : 0,
  };
}

export function withLineIds(lines) {
  return (lines || []).map((line) => ({
    ...line,
    id: line.id || crypto.randomUUID(),
  }));
}

export function nextJobNumber(jobs) {
  let max = 1000;
  for (const job of jobs) {
    const match = String(job.jobNumber || "").match(/(\d+)\s*$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `Q-${max + 1}`;
}

export function summarize(job) {
  const computed = job.computed || withComputed(job).computed;
  return {
    id: job.id,
    isExample: Boolean(job.isExample),
    status: job.status,
    jobNumber: job.jobNumber,
    customerName: job.customerName,
    jobName: job.jobName,
    quoteDate: job.quoteDate,
    quotedPrice: computed.quotedPrice,
    customerTotal: computed.customerTotal,
    expectedProfit: computed.expectedProfit,
    expectedMargin: computed.expectedMargin,
    actualCost: computed.actualCost,
    actualProfit: computed.actualProfit,
    actualMargin: computed.actualMargin,
    hasActuals: computed.hasActuals,
    profitability: computed.profitability,
  };
}

export function buildNewJob(setup, jobs) {
  return {
    id: crypto.randomUUID(),
    isExample: false,
    status: "estimating",
    jobNumber: nextJobNumber(jobs),
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    jobName: "Untitled job",
    jobAddress: "",
    quoteDate: todayIso(),
    scopeSummary: "",
    lessonsLearned: "",
    markupRate: setup.defaultMarkupRate,
    contingencyRate: setup.contingencyRate,
    salesTaxRate: setup.salesTaxRate,
    laborBurdenRate: setup.defaultLaborBurdenRate,
    quoteValidityDays: setup.quoteValidityDays,
    priceOverride: null,
    estimateLines: [emptyLine("labor", setup.defaultLaborBurdenRate)],
    actualLines: [],
  };
}

export function buildDuplicateJob(source, jobs) {
  return {
    ...source,
    id: crypto.randomUUID(),
    isExample: false,
    status: "estimating",
    jobNumber: nextJobNumber(jobs),
    quoteDate: todayIso(),
    lessonsLearned: "",
    actualLines: [],
    estimateLines: (source.estimateLines || []).map((line) => ({
      ...line,
      id: crypto.randomUUID(),
    })),
  };
}
