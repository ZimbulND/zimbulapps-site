/**
 * Customer-facing quote fields only. Keep cost, markup, burden, and profit out of this object.
 */
export function buildCustomerQuote(job = {}, setup = {}, computed = {}) {
  return {
    businessName: String(setup.businessName || "").trim(),
    contactName: String(setup.contactName || "").trim(),
    phone: String(setup.phone || "").trim(),
    email: String(setup.email || "").trim(),
    address: String(setup.address || "").trim(),
    website: String(setup.website || "").trim(),
    licenseNumber: String(setup.licenseNumber || "").trim(),
    insuranceNote: String(setup.insuranceNote || "").trim(),
    jobNumber: String(job.jobNumber || "").trim(),
    customerName: String(job.customerName || "").trim(),
    jobName: String(job.jobName || "").trim(),
    jobAddress: String(job.jobAddress || "").trim(),
    quoteDate: String(job.quoteDate || "").trim(),
    scopeSummary: String(job.scopeSummary || "").trim(),
    includedWork: (computed.estimateLines || [])
      .map((line) => String(line.description || "").trim())
      .filter(Boolean),
    quotedPrice: computed.quotedPrice || 0,
    salesTaxRate: computed.salesTaxRate || 0,
    salesTax: computed.salesTax || 0,
    customerTotal: computed.customerTotal || 0,
    validUntil: computed.validUntil || "",
    quoteValidityDays: computed.quoteValidityDays || 0,
    terms: String(setup.quoteTerms || "").trim(),
  };
}

export const INTERNAL_QUOTE_LEAKS = [
  "markup",
  "profit",
  "burden",
  "contingency",
  "estimatedCost",
  "actualCost",
  "margin",
  "unitCost",
  "workCost",
];
