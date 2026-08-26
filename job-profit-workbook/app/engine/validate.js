import { CATEGORY_IDS, JOB_STATUSES } from "./constants.js";
import { toNumber } from "./money.js";

const MAX = {
  markupRate: 4,
  contingencyRate: 1,
  salesTaxRate: 0.25,
  laborBurdenRate: 2,
  quoteValidityDays: 365,
  quantity: 1_000_000,
  unitCost: 1_000_000,
  priceOverride: 10_000_000,
};

export function validateSetup(input = {}) {
  const errors = [];
  const setup = {
    businessName: String(input.businessName || "").trim(),
    contactName: String(input.contactName || "").trim(),
    phone: String(input.phone || "").trim(),
    email: String(input.email || "").trim(),
    address: String(input.address || "").trim(),
    licenseNumber: String(input.licenseNumber || "").trim(),
    insuranceNote: String(input.insuranceNote || "").trim(),
    website: String(input.website || "").trim(),
    defaultMarkupRate: toNumber(input.defaultMarkupRate, 0),
    salesTaxRate: toNumber(input.salesTaxRate, 0),
    contingencyRate: toNumber(input.contingencyRate, 0),
    defaultLaborBurdenRate: toNumber(input.defaultLaborBurdenRate, 0),
    quoteValidityDays: Math.round(toNumber(input.quoteValidityDays, 30)),
    quoteTerms: String(input.quoteTerms || "").trim(),
  };

  if (setup.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(setup.email)) {
    errors.push("Enter a valid business email, or leave it blank.");
  }
  pushRateError(errors, "Default markup", setup.defaultMarkupRate, 0, MAX.markupRate);
  pushRateError(errors, "Sales tax", setup.salesTaxRate, 0, MAX.salesTaxRate);
  pushRateError(errors, "Contingency", setup.contingencyRate, 0, MAX.contingencyRate);
  pushRateError(errors, "Default labor burden", setup.defaultLaborBurdenRate, 0, MAX.laborBurdenRate);
  if (setup.quoteValidityDays < 1 || setup.quoteValidityDays > MAX.quoteValidityDays) {
    errors.push("Quote validity must be between 1 and 365 days.");
  }

  return { setup, errors };
}

export function validateJob(input = {}, options = {}) {
  const errors = [];
  const requireName = options.requireName !== false;

  const status = JOB_STATUSES.some((s) => s.id === input.status) ? input.status : "estimating";
  const job = {
    id: String(input.id || "").trim(),
    isExample: Boolean(input.isExample),
    status,
    jobNumber: String(input.jobNumber || "").trim(),
    customerName: String(input.customerName || "").trim(),
    customerPhone: String(input.customerPhone || "").trim(),
    customerEmail: String(input.customerEmail || "").trim(),
    jobName: String(input.jobName || "").trim(),
    jobAddress: String(input.jobAddress || "").trim(),
    quoteDate: String(input.quoteDate || "").trim(),
    scopeSummary: String(input.scopeSummary || "").trim(),
    lessonsLearned: String(input.lessonsLearned || "").trim(),
    markupRate: toNumber(input.markupRate, 0),
    contingencyRate: toNumber(input.contingencyRate, 0),
    salesTaxRate: toNumber(input.salesTaxRate, 0),
    laborBurdenRate: toNumber(input.laborBurdenRate, 0),
    quoteValidityDays: Math.round(toNumber(input.quoteValidityDays, 30)),
    priceOverride:
      input.priceOverride === null || input.priceOverride === undefined || input.priceOverride === ""
        ? null
        : toNumber(input.priceOverride, 0),
    estimateLines: sanitizeLines(input.estimateLines, errors, "Estimate"),
    actualLines: sanitizeLines(input.actualLines, errors, "Actual costs"),
  };

  if (requireName && !job.jobName) {
    errors.push("Enter a job name.");
  }
  if (job.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.customerEmail)) {
    errors.push("Enter a valid customer email, or leave it blank.");
  }
  if (job.quoteDate && !/^\d{4}-\d{2}-\d{2}$/.test(job.quoteDate)) {
    errors.push("Quote date must be a valid date.");
  }
  pushRateError(errors, "Markup", job.markupRate, 0, MAX.markupRate);
  pushRateError(errors, "Contingency", job.contingencyRate, 0, MAX.contingencyRate);
  pushRateError(errors, "Sales tax", job.salesTaxRate, 0, MAX.salesTaxRate);
  pushRateError(errors, "Labor burden", job.laborBurdenRate, 0, MAX.laborBurdenRate);
  if (job.quoteValidityDays < 0 || job.quoteValidityDays > MAX.quoteValidityDays) {
    errors.push("Quote validity must be between 0 and 365 days.");
  }
  if (job.priceOverride !== null && job.priceOverride < 0) {
    errors.push("Price override cannot be negative.");
  }
  if (job.priceOverride !== null && job.priceOverride > MAX.priceOverride) {
    errors.push("Price override is too large.");
  }

  return { job, errors };
}

function sanitizeLines(lines, errors, label) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line, index) => {
    const quantity = toNumber(line?.quantity, 0);
    const unitCost = toNumber(line?.unitCost, 0);
    const laborBurdenRate = toNumber(line?.laborBurdenRate, 0);
    const row = index + 1;
    if (quantity < 0) errors.push(`${label} row ${row}: quantity cannot be negative.`);
    if (quantity > MAX.quantity) errors.push(`${label} row ${row}: quantity is too large.`);
    if (unitCost < 0) errors.push(`${label} row ${row}: unit cost cannot be negative.`);
    if (unitCost > MAX.unitCost) errors.push(`${label} row ${row}: unit cost is too large.`);
    if (laborBurdenRate < 0 || laborBurdenRate > MAX.laborBurdenRate) {
      errors.push(`${label} row ${row}: labor burden must be between 0% and 200%.`);
    }
    return {
      id: String(line?.id || "").trim(),
      category: CATEGORY_IDS.includes(line?.category) ? line.category : "other",
      description: String(line?.description || "").trim(),
      quantity,
      unit: String(line?.unit || "").trim(),
      unitCost,
      laborBurdenRate,
    };
  });
}

function pushRateError(errors, label, rate, min, max) {
  if (rate < min || rate > max) {
    errors.push(`${label} must be between ${min * 100}% and ${max * 100}%.`);
  }
}
