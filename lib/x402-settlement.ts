import { getDb } from "../db";
import { paymentAudits } from "../db/schema";
import { classifyPaymentVerificationFailure } from "./payment-funnel";
import { recordFunnelEvent } from "./telemetry";
import {
  INTENTFENCE_ASSET,
  INTENTFENCE_FACILITATOR,
  INTENTFENCE_NETWORK,
  INTENTFENCE_PAY_TO,
  INTENTFENCE_PRICE_ATOMIC,
} from "./x402";
import { decodeX402Header } from "./x402-payment";
import { isSuccessfulX402Settlement } from "./x402-settlement-status";
import { classifySettlementSource } from "./x402-settlement-source";
import { paymentChallengeEventName } from "./request-traffic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function finalizeIntentFenceSettlement(
  request: Request,
  response: Response,
  product: "verified-preflight" | "x402-assessment" | "x402-readiness" | "wallet-risk" | "us-cpi" | "policy-pack",
  amountAtomic = INTENTFENCE_PRICE_ATOMIC,
) {
  const settlementResponse = response.headers.get("PAYMENT-RESPONSE");
  const requestId = response.headers.get("X-IntentFence-Request-ID");
  const sourceKind = classifySettlementSource(request);
  const hasPaymentSignature = Boolean(
    request.headers.get("PAYMENT-SIGNATURE") ?? request.headers.get("X-PAYMENT"),
  );
  const settlementSucceeded = isSuccessfulX402Settlement(response);

  if (hasPaymentSignature) {
    await recordFunnelEvent({
      eventName: "payment_signature_received",
      request,
      requestId,
      metadata: {
        amount_atomic: amountAtomic,
        protocol: "x402-v2",
        product,
        source_kind: sourceKind,
      },
    });
    await recordFunnelEvent({
      eventName: settlementSucceeded
        ? "payment_verification_succeeded"
        : "payment_verification_failed",
      request,
      requestId,
      metadata: {
        amount_atomic: amountAtomic,
        protocol: "x402-v2",
        product,
        source_kind: sourceKind,
        ...(settlementSucceeded
          ? {}
          : { reason: classifyPaymentVerificationFailure(response) }),
      },
    });
  }

  if (settlementResponse && requestId && settlementSucceeded) {
    let auditWritten = false;
    try {
      const decodedSettlement = decodeX402Header(settlementResponse);
      const paymentHeader =
        request.headers.get("PAYMENT-SIGNATURE") ?? request.headers.get("X-PAYMENT");
      const decodedPayment = decodeX402Header(paymentHeader);
      const settlement = isRecord(decodedSettlement) ? decodedSettlement : {};
      const payment = isRecord(decodedPayment) ? decodedPayment : {};
      const payload = isRecord(payment.payload) ? payment.payload : {};
      const authorization = isRecord(payload.authorization) ? payload.authorization : {};
      const payerAddress = typeof settlement.payer === "string"
        ? settlement.payer
        : typeof payment.payer === "string"
          ? payment.payer
          : typeof authorization.from === "string"
            ? authorization.from
            : null;
      const transactionHash = typeof settlement.transaction === "string"
        ? settlement.transaction
        : null;
      let decisionStatus: string | null = null;
      let receiptId: string | null = null;
      try {
        const paidBody = await response.clone().json() as Record<string, unknown>;
        decisionStatus = typeof paidBody.status === "string" ? paidBody.status : null;
        const receipt = isRecord(paidBody.receipt) ? paidBody.receipt : {};
        receiptId = typeof receipt.id === "string" ? receipt.id : null;
      } catch {
        // The facilitator settlement remains authoritative if the body is unavailable.
      }

      let lastAuditError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await getDb()
            .insert(paymentAudits)
            .values({
              id: crypto.randomUUID(),
              requestId,
              network: INTENTFENCE_NETWORK,
              asset: INTENTFENCE_ASSET,
              amountAtomic,
              payTo: INTENTFENCE_PAY_TO,
              settlementResponse: settlementResponse.slice(0, 4096),
              status: "settled",
              payerAddress,
              transactionHash,
              facilitator: INTENTFENCE_FACILITATOR,
              sourceKind,
              decisionStatus,
              receiptId,
              createdAt: new Date(),
            })
            .onConflictDoNothing({ target: paymentAudits.requestId });
          auditWritten = true;
          break;
        } catch (error) {
          lastAuditError = error;
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 50));
          }
        }
      }
      if (!auditWritten) throw lastAuditError;
    } catch (error) {
      console.error("IntentFence payment audit write failed", {
        requestId,
        product,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }

    response.headers.set("X-IntentFence-Audit-Status", auditWritten ? "persisted" : "failed");
    await Promise.all([
      recordFunnelEvent({
        eventName: sourceKind === "external"
          ? "payment_settled"
          : "payment_verification_settled",
        request,
        requestId,
        metadata: {
          amount_atomic: amountAtomic,
          protocol: "x402-v2",
          product,
          audit_persisted: auditWritten,
          source_kind: sourceKind,
        },
      }),
      recordFunnelEvent({
        eventName: "receipt_issued",
        request,
        requestId,
        metadata: {
          format: "JWS Compact",
          algorithm: "ES256",
          product,
        },
      }),
    ]);
  } else if (response.status === 402) {
    await recordFunnelEvent({
      eventName: paymentChallengeEventName(request),
      request,
      metadata: { reason: "payment_not_verified", protocol: "rest-x402", product },
    });
  }

  return response;
}
