export function validateUsCpiInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Input must be an object.");
  }
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "month")) throw new Error("Only month is supported.");
  if (value.month === undefined) return {};
  if (typeof value.month !== "string" || !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value.month)) {
    throw new Error("month must use YYYY-MM.");
  }
  return { month: value.month };
}
