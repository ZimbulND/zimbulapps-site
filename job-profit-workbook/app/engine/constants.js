export const CATEGORIES = [
  { id: "labor", label: "Labor" },
  { id: "material", label: "Material" },
  { id: "subcontractor", label: "Subcontractor" },
  { id: "equipment", label: "Equipment" },
  { id: "other", label: "Other" },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export const JOB_STATUSES = [
  { id: "estimating", label: "Estimating" },
  { id: "quoted", label: "Quoted" },
  { id: "in_progress", label: "In progress" },
  { id: "complete", label: "Complete" },
];

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || "Other";
}
