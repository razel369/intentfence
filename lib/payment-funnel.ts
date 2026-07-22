export type PaymentVerificationFailureReason =
  | "request_invalid"
  | "authorization_conflict"
  | "facilitator_rejected"
  | "rate_limited"
  | "dependency_unavailable"
  | "internal_error"
  | "settlement_unconfirmed";

/**
 * Reduces a payment failure to an allowlisted category. Raw facilitator errors,
 * response bodies, and payment payloads must never enter funnel telemetry.
 */
export function classifyPaymentVerificationFailure(
  response: Pick<Response, "status">,
): PaymentVerificationFailureReason {
  if (response.status === 400 || response.status === 422) return "request_invalid";
  if (response.status === 409) return "authorization_conflict";
  if (response.status === 402) return "facilitator_rejected";
  if (response.status === 429) return "rate_limited";
  if (response.status === 503) return "dependency_unavailable";
  if (response.status >= 500) return "internal_error";
  return "settlement_unconfirmed";
}
