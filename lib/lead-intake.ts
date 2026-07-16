export type LeadPlan = "pilot" | "production" | "enterprise" | "high_assurance" | "fleet";

export function normalizeLeadPlan(value: unknown): LeadPlan {
  if (
    value === "pilot" ||
    value === "production" ||
    value === "enterprise" ||
    value === "high_assurance" ||
    value === "fleet"
  ) {
    return value;
  }
  return "pilot";
}
