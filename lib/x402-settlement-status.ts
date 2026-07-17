function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeSettlementHeader(value: string | null) {
  if (!value) return null;
  try {
    const normalized = value.trim().replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as unknown;
  } catch {
    return null;
  }
}

export function isSuccessfulX402Settlement(response: Response) {
  if (!response.ok) return false;
  const settlement = decodeSettlementHeader(response.headers.get("PAYMENT-RESPONSE"));
  return isRecord(settlement) && settlement.success === true;
}
