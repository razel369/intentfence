import { eq, lt } from "drizzle-orm";
import { paymentReservations } from "../db/schema.ts";
import { INTENTFENCE_USDC_CONTRACT } from "./x402.ts";

const MAX_RESERVATION_MS = 10 * 60 * 1_000;
const MIN_RESERVATION_MS = 30 * 1_000;

export type X402ReservationProduct =
  | "verified-preflight"
  | "x402-assessment"
  | "wallet-risk"
  | "us-cpi";

export class X402PaymentReservationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "X402PaymentReservationInputError";
  }
}

export class X402PaymentReservationConflictError extends Error {
  constructor() {
    super("This x402 payment authorization is already in flight or was already used.");
    this.name = "X402PaymentReservationConflictError";
  }
}

export class X402PaymentReservationUnavailableError extends Error {
  constructor() {
    super("Payment authorization reservation is temporarily unavailable.");
    this.name = "X402PaymentReservationUnavailableError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEvmAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/u.test(value);
}

function validNonce(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/u.test(value);
}

function decodePaymentHeader(value: string): unknown | null {
  try {
    const normalized = value.trim().replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as unknown;
  } catch {
    return null;
  }
}

async function sha256(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function x402PaymentAuthorizationFingerprint(paymentHeader: string) {
  const decoded = decodePaymentHeader(paymentHeader);
  if (!isRecord(decoded) || decoded.x402Version !== 2 || !isRecord(decoded.payload)) {
    throw new X402PaymentReservationInputError(
      "PAYMENT-SIGNATURE must contain an x402 v2 payment payload.",
    );
  }
  const authorization = isRecord(decoded.payload.authorization)
    ? decoded.payload.authorization
    : null;
  if (
    !authorization ||
    !isEvmAddress(authorization.from) ||
    !validNonce(authorization.nonce) ||
    typeof authorization.validBefore !== "string" ||
    !/^[0-9]{1,20}$/u.test(authorization.validBefore)
  ) {
    throw new X402PaymentReservationInputError(
      "PAYMENT-SIGNATURE must contain a bounded EIP-3009 authorization.",
    );
  }

  const validBeforeSeconds = Number(authorization.validBefore);
  if (!Number.isSafeInteger(validBeforeSeconds)) {
    throw new X402PaymentReservationInputError(
      "PAYMENT-SIGNATURE contains an invalid authorization expiry.",
    );
  }

  const authorizationHash = await sha256([
    "x402-eip3009",
    INTENTFENCE_USDC_CONTRACT.toLowerCase(),
    authorization.from.toLowerCase(),
    authorization.nonce.toLowerCase(),
  ].join("|"));
  const now = Date.now();
  const authorizationExpiry = validBeforeSeconds * 1_000;
  const expiresAt = new Date(
    Math.max(
      now + MIN_RESERVATION_MS,
      Math.min(authorizationExpiry, now + MAX_RESERVATION_MS),
    ),
  );
  return { authorizationHash, expiresAt };
}

export async function reserveX402PaymentAuthorization(
  paymentHeader: string,
  product: X402ReservationProduct,
) {
  const reservation = await x402PaymentAuthorizationFingerprint(paymentHeader);
  const now = new Date();
  try {
    const { getDb } = await import("../db/index.ts");
    const db = getDb();
    await db
      .delete(paymentReservations)
      .where(lt(paymentReservations.expiresAt, now));
    const inserted = await db
      .insert(paymentReservations)
      .values({
        authorizationHash: reservation.authorizationHash,
        product,
        status: "reserved",
        reservedAt: now,
        expiresAt: reservation.expiresAt,
      })
      .onConflictDoNothing({ target: paymentReservations.authorizationHash })
      .returning({ authorizationHash: paymentReservations.authorizationHash });
    if (inserted.length !== 1) {
      throw new X402PaymentReservationConflictError();
    }
    return reservation.authorizationHash;
  } catch (error) {
    if (error instanceof X402PaymentReservationConflictError) throw error;
    console.error("IntentFence x402 reservation failed", {
      product,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    throw new X402PaymentReservationUnavailableError();
  }
}

export async function releaseX402PaymentAuthorization(authorizationHash: string) {
  const { getDb } = await import("../db/index.ts");
  await getDb()
    .delete(paymentReservations)
    .where(eq(paymentReservations.authorizationHash, authorizationHash));
}
