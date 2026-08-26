import {
  applyRateToCents,
  centsFromQuantityCost,
  fromCents,
  roundMoney,
  toCents,
  toNumber,
} from "./money.js";
import { CATEGORY_IDS, categoryLabel } from "./constants.js";

function lineCategory(line) {
  const category = String(line?.category || "other").toLowerCase();
  return CATEGORY_IDS.includes(category) ? category : "other";
}

function defaultBurdenRate(line, jobBurdenRate) {
  const category = lineCategory(line);
  if (line?.laborBurdenRate === null || line?.laborBurdenRate === undefined || line?.laborBurdenRate === "") {
    return category === "labor" ? toNumber(jobBurdenRate, 0) : 0;
  }
  return toNumber(line.laborBurdenRate, 0);
}

export function computeLine(line, jobBurdenRate = 0) {
  const quantity = toNumber(line?.quantity, 0);
  const unitCost = toNumber(line?.unitCost, 0);
  const laborBurdenRate = defaultBurdenRate(line, jobBurdenRate);
  const baseCostCents = centsFromQuantityCost(quantity, unitCost);
  const laborBurdenCents = applyRateToCents(baseCostCents, laborBurdenRate);
  const totalCostCents = baseCostCents + laborBurdenCents;

  return {
    id: line?.id || "",
    category: lineCategory(line),
    description: String(line?.description || "").trim(),
    quantity,
    unit: String(line?.unit || "").trim(),
    unitCost: roundMoney(unitCost),
    laborBurdenRate,
    baseCost: fromCents(baseCostCents),
    laborBurden: fromCents(laborBurdenCents),
    cost: fromCents(totalCostCents),
    baseCostCents,
    laborBurdenCents,
    costCents: totalCostCents,
  };
}

function sumCents(lines, field) {
  return lines.reduce((sum, line) => sum + toNumber(line[field], 0), 0);
}

function totalsByCategory(estimateLines, actualLines) {
  const rows = CATEGORY_IDS.map((id) => {
    const estimatedCents = estimateLines
      .filter((line) => line.category === id)
      .reduce((sum, line) => sum + line.costCents, 0);
    const actualCents = actualLines
      .filter((line) => line.category === id)
      .reduce((sum, line) => sum + line.costCents, 0);
    const varianceCents = actualCents - estimatedCents;
    return {
      category: id,
      label: categoryLabel(id),
      estimated: fromCents(estimatedCents),
      actual: fromCents(actualCents),
      variance: fromCents(varianceCents),
      estimatedCents,
      actualCents,
      varianceCents,
    };
  });

  const overruns = rows.filter((row) => row.varianceCents > 0);
  const largestOverrun = overruns.sort((a, b) => b.varianceCents - a.varianceCents)[0] || null;

  return { rows, largestOverrun };
}

function addDays(isoDate, days) {
  if (!isoDate) return "";
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + toNumber(days, 0));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function computeJob(job = {}) {
  const markupRate = toNumber(job.markupRate, 0);
  const contingencyRate = toNumber(job.contingencyRate, 0);
  const salesTaxRate = toNumber(job.salesTaxRate, 0);
  const laborBurdenRate = toNumber(job.laborBurdenRate, 0);
  const quoteValidityDays = Math.max(0, Math.round(toNumber(job.quoteValidityDays, 0)));

  const estimateLines = (job.estimateLines || []).map((line) => computeLine(line, laborBurdenRate));
  const actualLines = (job.actualLines || []).map((line) => computeLine(line, laborBurdenRate));

  const workCostCents = sumCents(estimateLines, "costCents");
  const contingencyCents = applyRateToCents(workCostCents, contingencyRate);
  const totalEstimatedCostCents = workCostCents + contingencyCents;
  const markupCents = applyRateToCents(totalEstimatedCostCents, markupRate);
  const recommendedPriceCents = totalEstimatedCostCents + markupCents;

  const hasOverride =
    job.priceOverride !== null &&
    job.priceOverride !== undefined &&
    job.priceOverride !== "";
  const quotedPriceCents = hasOverride ? toCents(job.priceOverride) : recommendedPriceCents;
  const salesTaxCents = applyRateToCents(quotedPriceCents, salesTaxRate);
  const customerTotalCents = quotedPriceCents + salesTaxCents;

  const expectedProfitCents = quotedPriceCents - totalEstimatedCostCents;
  const expectedMargin = quotedPriceCents > 0 ? expectedProfitCents / quotedPriceCents : 0;

  const actualCostCents = sumCents(actualLines, "costCents");
  const hasActuals = (job.actualLines || []).some(
    (line) => toNumber(line?.quantity, 0) !== 0 || toNumber(line?.unitCost, 0) !== 0 || String(line?.description || "").trim() !== "",
  );
  const actualProfitCents = quotedPriceCents - actualCostCents;
  const actualMargin = quotedPriceCents > 0 ? actualProfitCents / quotedPriceCents : 0;

  const costVarianceVsEstimateCents = actualCostCents - totalEstimatedCostCents;
  const costVarianceVsWorkCents = actualCostCents - workCostCents;
  const profitVarianceCents = actualProfitCents - expectedProfitCents;
  const overrunPastContingencyCents = Math.max(0, actualCostCents - totalEstimatedCostCents);
  const unusedContingencyCents = Math.max(0, totalEstimatedCostCents - actualCostCents);

  const category = totalsByCategory(estimateLines, actualLines);

  let profitability = "incomplete";
  if (hasActuals) {
    if (actualProfitCents < 0) profitability = "loss";
    else if (actualProfitCents < expectedProfitCents) profitability = "below_estimate";
    else profitability = "held";
  }

  return {
    markupRate,
    contingencyRate,
    salesTaxRate,
    laborBurdenRate,
    quoteValidityDays,
    validUntil: addDays(job.quoteDate, quoteValidityDays),
    estimateLines,
    actualLines,
    workCost: fromCents(workCostCents),
    contingency: fromCents(contingencyCents),
    totalEstimatedCost: fromCents(totalEstimatedCostCents),
    markup: fromCents(markupCents),
    recommendedPrice: fromCents(recommendedPriceCents),
    hasOverride,
    quotedPrice: fromCents(quotedPriceCents),
    salesTax: fromCents(salesTaxCents),
    customerTotal: fromCents(customerTotalCents),
    expectedProfit: fromCents(expectedProfitCents),
    expectedMargin: roundMoney(expectedMargin * 100) / 100,
    actualCost: fromCents(actualCostCents),
    hasActuals,
    actualProfit: fromCents(actualProfitCents),
    actualMargin: roundMoney(actualMargin * 100) / 100,
    costVarianceVsEstimate: fromCents(costVarianceVsEstimateCents),
    costVarianceVsWork: fromCents(costVarianceVsWorkCents),
    profitVariance: fromCents(profitVarianceCents),
    overrunPastContingency: fromCents(overrunPastContingencyCents),
    unusedContingency: fromCents(unusedContingencyCents),
    categoryTotals: category.rows,
    largestOverrun: category.largestOverrun
      ? {
          category: category.largestOverrun.category,
          label: category.largestOverrun.label,
          amount: category.largestOverrun.variance,
        }
      : null,
    profitability,
  };
}

export function withComputed(job) {
  const computed = computeJob(job);
  return {
    ...job,
    computed,
  };
}
