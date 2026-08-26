export const DEFAULT_SETUP = {
  businessName: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  licenseNumber: "",
  insuranceNote: "",
  website: "",
  defaultMarkupRate: 0.3,
  salesTaxRate: 0,
  contingencyRate: 0.05,
  defaultLaborBurdenRate: 0.2,
  quoteValidityDays: 30,
  quoteTerms:
    "This quote covers only the work described above. Anything not listed is excluded. Prices are based on current material and labor costs and may change if the scope changes. Payment terms to be agreed in writing. This quote is valid through the date shown.",
};

export const EXAMPLE_JOB_ID = "example-hall-bath-remodel";

export function buildExampleJob() {
  return {
    id: EXAMPLE_JOB_ID,
    isExample: true,
    status: "complete",
    jobNumber: "Q-1042",
    customerName: "Maria Rivera",
    customerPhone: "(555) 014-2208",
    customerEmail: "maria.rivera@example.com",
    jobName: "Hall bathroom remodel",
    jobAddress: "184 Maple Street, Springfield",
    quoteDate: "2026-03-12",
    scopeSummary:
      "Remodel the hall bathroom including demolition of the existing vanity and toilet, installation of a new vanity, faucet, toilet, and ceramic floor tile, licensed plumbing hookup, and debris hauling. Paint, tub/shower, and electrical work are excluded.",
    lessonsLearned:
      "Tile layout needed extra boxes and the install ran longer than planned because the floor was out of level. Next similar bath: add 8 labor hours for floor prep and keep one extra carton of tile in the estimate.",
    markupRate: 0.3,
    contingencyRate: 0.1,
    salesTaxRate: 0.06,
    laborBurdenRate: 0.3,
    quoteValidityDays: 30,
    priceOverride: null,
    estimateLines: [
      line("e1", "labor", "Demolition of existing vanity and toilet", 8, "hrs", 50, 0.3),
      line("e2", "labor", "Install vanity, toilet, and floor tile", 32, "hrs", 50, 0.3),
      line("e3", "material", "Vanity, faucet, and toilet", 1, "ea", 1450, 0),
      line("e4", "material", "Ceramic tile, thinset, and grout", 120, "sq ft", 6.5, 0),
      line("e5", "subcontractor", "Plumbing rough-in and fixture hookup", 1, "ls", 950, 0),
      line("e6", "equipment", "Tile wet saw rental", 3, "days", 45, 0),
      line("e7", "other", "Debris hauling", 1, "ls", 225, 0),
    ],
    actualLines: [
      line("a1", "labor", "Demolition of existing vanity and toilet", 9, "hrs", 50, 0.3),
      line("a2", "labor", "Install vanity, toilet, and floor tile", 41, "hrs", 50, 0.3),
      line("a3", "material", "Vanity, faucet, and toilet", 1, "ea", 1520, 0),
      line("a4", "material", "Ceramic tile, thinset, and grout", 140, "sq ft", 6.5, 0),
      line("a5", "subcontractor", "Plumbing rough-in and fixture hookup", 1, "ls", 950, 0),
      line("a6", "equipment", "Tile wet saw rental", 2, "days", 45, 0),
      line("a7", "other", "Debris hauling", 1, "ls", 225, 0),
    ],
  };
}

function line(id, category, description, quantity, unit, unitCost, laborBurdenRate) {
  return { id, category, description, quantity, unit, unitCost, laborBurdenRate };
}

/**
 * Golden totals for the example job. Kept here so product copy and tests stay aligned.
 * See tests/calculations.test.js for the arithmetic.
 */
export const EXAMPLE_EXPECTED = {
  workCost: 6140,
  contingency: 614,
  totalEstimatedCost: 6754,
  markup: 2026.2,
  recommendedPrice: 8780.2,
  quotedPrice: 8780.2,
  salesTax: 526.81,
  customerTotal: 9307.01,
  expectedProfit: 2026.2,
  expectedMargin: 0.2308,
  actualCost: 6945,
  actualProfit: 1835.2,
  actualMargin: 0.209,
  costVarianceVsEstimate: 191,
  largestOverrunCategory: "labor",
  largestOverrunAmount: 650,
};
