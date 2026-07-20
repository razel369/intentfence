import { NextRequest } from "next/server.js";

/**
 * x402 v2 names the request header PAYMENT-SIGNATURE. Some marketplace
 * clients still send the same base64-encoded v2 payload as X-PAYMENT.
 * @x402/next advertises that alias, but the underlying HTTP resource server
 * currently reads PAYMENT-SIGNATURE only. Normalize the alias at our edge so
 * those buyers can complete verification and settlement without weakening the
 * payload or facilitator checks.
 */
export function normalizeX402PaymentRequest(request: NextRequest) {
  const paymentSignature = request.headers.get("PAYMENT-SIGNATURE");
  const legacyPayment = request.headers.get("X-PAYMENT");
  if (paymentSignature || !legacyPayment) return request;

  const headers = new Headers(request.headers);
  headers.set("PAYMENT-SIGNATURE", legacyPayment);
  return new NextRequest(request, { headers });
}
