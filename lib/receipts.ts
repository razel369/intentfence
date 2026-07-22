import type { ActionAuthorizationDecision } from "./action-authorization";

const SITE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";
const RECEIPT_AUDIENCE = "intentfence-verifier";
const RECEIPT_TTL_SECONDS = 86_400;
const ASSESSMENT_RECEIPT_TTL_SECONDS = 300;

export const INTENTFENCE_SIGNING_KID = "intentfence-es256-2026-07";
type IntentFenceJwk = JsonWebKey & {
  alg: "ES256";
  kid: typeof INTENTFENCE_SIGNING_KID;
  use: "sig";
  d?: string;
};

export const INTENTFENCE_PUBLIC_JWK: IntentFenceJwk = {
  key_ops: ["verify"],
  ext: true,
  kty: "EC",
  x: "hJCzHY9kFr2LX7KqpVOtXjOKnJ43Yvap7VWoDmIuF34",
  y: "3YhOJX-ai6IiiYhpK8okWq-83oLoPmdFSRwuEZNp2MQ",
  crv: "P-256",
  alg: "ES256",
  kid: INTENTFENCE_SIGNING_KID,
  use: "sig",
};

export type ReceiptDecision = {
  request_id: string;
  status: "safe_to_proceed" | "needs_review" | "denied" | "verified";
  checks: unknown[];
  receipt: {
    id: string;
    issued_at: string;
    subject: string | null;
    action: unknown;
  };
};

export type ReceiptClaims = {
  iss: typeof SITE_URL;
  aud: typeof RECEIPT_AUDIENCE;
  iat: number;
  exp: number;
  jti: string;
  intentfence_version: "0.5";
  assurance: "declared-input-policy";
  request_id: string;
  decision: ReceiptDecision["status"];
  subject: string | null;
  action: unknown;
  checks: unknown[];
  payment: {
    protocol: "x402-v2";
    network: string;
    asset: string;
    amount_atomic: string;
    pay_to: string;
  };
};

export type AssessmentReceiptClaims = Omit<
  ReceiptClaims,
  "intentfence_version" | "assurance"
> & {
  intentfence_version: "0.6";
  assurance: "caller-observed-x402-quote-assessment";
  evidence: {
    assessed_at: string;
    target_url_sha256: string;
    target_origin: string;
    target_pathname: string;
    target_method: "GET" | "HEAD" | "POST";
    payment_requirements_sha256: string;
  };
};

export type WalletRiskReceiptClaims = Omit<
  ReceiptClaims,
  "intentfence_version" | "assurance"
> & {
  intentfence_version: "0.7";
  assurance: "live-base-wallet-risk";
  evidence: {
    assessed_at: string;
    address: string;
    network: "eip155:8453";
    block_number: string;
    malicious_flags: string[];
    intelligence_source: string;
  };
};

export type OfficialDataReceiptClaims = Omit<
  ReceiptClaims,
  "intentfence_version" | "assurance"
> & {
  intentfence_version: "0.8";
  assurance: "official-source-data";
  evidence: {
    publisher: "U.S. Bureau of Labor Statistics";
    retrieved_at: string;
    period: string;
    series_ids: string[];
    source_api: string;
    headline_index: number;
    core_index: number;
  };
};

export type ReadinessReceiptClaims = Omit<
  ReceiptClaims,
  "intentfence_version" | "assurance"
> & {
  intentfence_version: "0.9";
  assurance: "live-x402-endpoint-readiness";
  evidence: {
    checked_at: string;
    target_origin: string;
    target_pathname: string;
    target_method: "GET" | "HEAD" | "POST";
    http_status: number | null;
    payment_required_present: boolean;
    redirect_blocked: boolean;
    payment_requirements_sha256: string | null;
  };
};

export type ActionAuthorizationReceiptClaims = {
  iss: typeof SITE_URL;
  aud: typeof RECEIPT_AUDIENCE;
  iat: number;
  exp: number;
  jti: string;
  intentfence_version: "1.0";
  assurance: "action-bound-policy-authorization";
  request_id: string;
  decision: "safe_to_proceed" | "needs_review" | "denied";
  subject: string;
  action: ActionAuthorizationDecision["action"];
  checks: ActionAuthorizationDecision["checks"];
  evidence: {
    authorized_at: string;
    action_digest: string;
    policy_digest: string;
    enforcement_mode: "caller-side-fail-closed";
  };
};

export type VerifiableReceiptClaims =
  | ReceiptClaims
  | AssessmentReceiptClaims
  | WalletRiskReceiptClaims
  | OfficialDataReceiptClaims
  | ReadinessReceiptClaims
  | ActionAuthorizationReceiptClaims;

export type SignedReceipt = ReceiptDecision["receipt"] & {
  signed: true;
  assurance: "declared-input-policy";
  expires_at: string;
  payment_assurance: "x402-settled";
  payment_network: string;
  payment_asset: string;
  payment_amount_atomic: string;
  pay_to: string;
  signature: {
    format: "JWS Compact";
    alg: "ES256";
    kid: typeof INTENTFENCE_SIGNING_KID;
    jws: string;
    verify_url: string;
    jwks_url: string;
  };
  note: string;
};

export type SignedAssessmentReceipt = Omit<
  SignedReceipt,
  "assurance" | "note"
> & {
  assurance: "caller-observed-x402-quote-assessment";
  note: string;
};

export type SignedWalletRiskReceipt = Omit<
  SignedReceipt,
  "assurance" | "note"
> & {
  assurance: "live-base-wallet-risk";
  note: string;
};

export type SignedOfficialDataReceipt = Omit<
  SignedReceipt,
  "assurance" | "note"
> & {
  assurance: "official-source-data";
  note: string;
};

export type SignedReadinessReceipt = Omit<
  SignedReceipt,
  "assurance" | "note"
> & {
  assurance: "live-x402-endpoint-readiness";
  note: string;
};

export type SignedActionAuthorizationReceipt = Omit<
  ActionAuthorizationDecision["receipt"],
  "signed" | "note"
> & {
  signed: true;
  assurance: "action-bound-policy-authorization";
  expires_at: string;
  action_digest: string;
  policy_digest: string;
  signature: {
    format: "JWS Compact";
    alg: "ES256";
    kid: typeof INTENTFENCE_SIGNING_KID;
    jws: string;
    verify_url: string;
    jwks_url: string;
  };
  note: string;
};

export class ReceiptSigningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptSigningError";
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function stringToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Invalid base64url value.");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlToJson(value: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePrivateJwk(value: string) {
  let jwk: unknown;
  try {
    jwk = JSON.parse(value) as unknown;
  } catch {
    throw new ReceiptSigningError("The receipt signing key is not valid JSON.");
  }
  if (
    !isRecord(jwk) ||
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    jwk.alg !== "ES256" ||
    jwk.kid !== INTENTFENCE_SIGNING_KID ||
    typeof jwk.d !== "string"
  ) {
    throw new ReceiptSigningError("The receipt signing key is not the configured ES256 key.");
  }
  return jwk as unknown as IntentFenceJwk;
}

export async function signReceiptClaims(claims: VerifiableReceiptClaims, privateJwk: string) {
  const header = { alg: "ES256", kid: INTENTFENCE_SIGNING_KID, typ: "intentfence+jws" } as const;
  const protectedHeader = stringToBase64Url(JSON.stringify(header));
  const payload = stringToBase64Url(JSON.stringify(claims));
  const signingInput = `${protectedHeader}.${payload}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    parsePrivateJwk(privateJwk),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  if (signature.byteLength !== 64) {
    throw new ReceiptSigningError("The ES256 signer returned an unexpected signature format.");
  }
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

export async function validateReceiptSigningKey(privateJwk: string) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const jws = await signReceiptClaims(
      {
        iss: SITE_URL,
        aud: RECEIPT_AUDIENCE,
        iat: now,
        exp: now + 60,
        jti: "if_healthcheck",
        intentfence_version: "0.5",
        assurance: "declared-input-policy",
        request_id: "00000000-0000-4000-8000-000000000000",
        decision: "needs_review",
        subject: null,
        action: { type: "healthcheck" },
        checks: [],
        payment: {
          protocol: "x402-v2",
          network: "eip155:8453",
          asset: "USDC",
          amount_atomic: "0",
          pay_to: "0x0000000000000000000000000000000000000000",
        },
      },
      privateJwk,
    );
    return (await verifyReceipt(jws)).valid;
  } catch {
    return false;
  }
}

export async function createSignedReceipt(
  decision: ReceiptDecision,
  privateJwk: string,
  payment: { network: string; asset: string; amountAtomic: string; payTo: string },
): Promise<SignedReceipt> {
  const issuedAtSeconds = Math.floor(new Date(decision.receipt.issued_at).getTime() / 1000);
  const claims: ReceiptClaims = {
    iss: SITE_URL,
    aud: RECEIPT_AUDIENCE,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + RECEIPT_TTL_SECONDS,
    jti: decision.receipt.id,
    intentfence_version: "0.5",
    assurance: "declared-input-policy",
    request_id: decision.request_id,
    decision: decision.status,
    subject: decision.receipt.subject,
    action: decision.receipt.action,
    checks: decision.checks,
    payment: {
      protocol: "x402-v2",
      network: payment.network,
      asset: payment.asset,
      amount_atomic: payment.amountAtomic,
      pay_to: payment.payTo,
    },
  };
  const jws = await signReceiptClaims(claims, privateJwk);
  return {
    ...decision.receipt,
    signed: true,
    assurance: "declared-input-policy",
    expires_at: new Date(claims.exp * 1000).toISOString(),
    payment_assurance: "x402-settled",
    payment_network: payment.network,
    payment_asset: payment.asset,
    payment_amount_atomic: payment.amountAtomic,
    pay_to: payment.payTo,
    signature: {
      format: "JWS Compact",
      alg: "ES256",
      kid: INTENTFENCE_SIGNING_KID,
      jws,
      verify_url: `${SITE_URL}/api/receipts/verify`,
      jwks_url: `${SITE_URL}/.well-known/jwks.json`,
    },
    note: "IntentFence signed the declared-input policy decision. PAYMENT-RESPONSE separately proves x402 settlement; neither proves real-world identity or authorization.",
  };
}

export async function createSignedAssessmentReceipt(
  decision: ReceiptDecision & {
    assessed_at: string;
    target: {
      origin: string;
      pathname: string;
      method: "GET" | "HEAD" | "POST";
      url_sha256: string;
    };
    observed: {
      payment_requirements_sha256: string;
    };
  },
  privateJwk: string,
  payment: { network: string; asset: string; amountAtomic: string; payTo: string },
): Promise<SignedAssessmentReceipt> {
  const issuedAtSeconds = Math.floor(new Date(decision.receipt.issued_at).getTime() / 1000);
  const claims: AssessmentReceiptClaims = {
    iss: SITE_URL,
    aud: RECEIPT_AUDIENCE,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + ASSESSMENT_RECEIPT_TTL_SECONDS,
    jti: decision.receipt.id,
    intentfence_version: "0.6",
    assurance: "caller-observed-x402-quote-assessment",
    request_id: decision.request_id,
    decision: decision.status,
    subject: decision.receipt.subject,
    action: decision.receipt.action,
    checks: decision.checks,
    evidence: {
      assessed_at: decision.assessed_at,
      target_url_sha256: decision.target.url_sha256,
      target_origin: decision.target.origin,
      target_pathname: decision.target.pathname,
      target_method: decision.target.method,
      payment_requirements_sha256: decision.observed.payment_requirements_sha256,
    },
    payment: {
      protocol: "x402-v2",
      network: payment.network,
      asset: payment.asset,
      amount_atomic: payment.amountAtomic,
      pay_to: payment.payTo,
    },
  };
  const jws = await signReceiptClaims(claims, privateJwk);
  return {
    ...decision.receipt,
    signed: true,
    assurance: "caller-observed-x402-quote-assessment",
    expires_at: new Date(claims.exp * 1000).toISOString(),
    payment_assurance: "x402-settled",
    payment_network: payment.network,
    payment_asset: payment.asset,
    payment_amount_atomic: payment.amountAtomic,
    pay_to: payment.payTo,
    signature: {
      format: "JWS Compact",
      alg: "ES256",
      kid: INTENTFENCE_SIGNING_KID,
      jws,
      verify_url: `${SITE_URL}/api/receipts/verify`,
      jwks_url: `${SITE_URL}/.well-known/jwks.json`,
    },
    note: "IntentFence signed the SHA-256 of the exact caller-supplied x402 challenge for five minutes. Compare that hash with the current PAYMENT-REQUIRED value before signing the target payment. PAYMENT-RESPONSE separately proves settlement of the IntentFence assessment fee.",
  };
}

export async function createSignedWalletRiskReceipt(
  decision: ReceiptDecision & {
    assessed_at: string;
    subject: { address: string; network: "eip155:8453" };
    observed: {
      block_number: string;
      malicious_flags: string[];
      intelligence_source: string;
    };
  },
  privateJwk: string,
  payment: { network: string; asset: string; amountAtomic: string; payTo: string },
): Promise<SignedWalletRiskReceipt> {
  const issuedAtSeconds = Math.floor(new Date(decision.receipt.issued_at).getTime() / 1000);
  const claims: WalletRiskReceiptClaims = {
    iss: SITE_URL,
    aud: RECEIPT_AUDIENCE,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + ASSESSMENT_RECEIPT_TTL_SECONDS,
    jti: decision.receipt.id,
    intentfence_version: "0.7",
    assurance: "live-base-wallet-risk",
    request_id: decision.request_id,
    decision: decision.status,
    subject: decision.receipt.subject,
    action: decision.receipt.action,
    checks: decision.checks,
    evidence: {
      assessed_at: decision.assessed_at,
      address: decision.subject.address,
      network: decision.subject.network,
      block_number: decision.observed.block_number,
      malicious_flags: decision.observed.malicious_flags,
      intelligence_source: decision.observed.intelligence_source,
    },
    payment: {
      protocol: "x402-v2",
      network: payment.network,
      asset: payment.asset,
      amount_atomic: payment.amountAtomic,
      pay_to: payment.payTo,
    },
  };
  const jws = await signReceiptClaims(claims, privateJwk);
  return {
    ...decision.receipt,
    signed: true,
    assurance: "live-base-wallet-risk",
    expires_at: new Date(claims.exp * 1000).toISOString(),
    payment_assurance: "x402-settled",
    payment_network: payment.network,
    payment_asset: payment.asset,
    payment_amount_atomic: payment.amountAtomic,
    pay_to: payment.payTo,
    signature: {
      format: "JWS Compact",
      alg: "ES256",
      kid: INTENTFENCE_SIGNING_KID,
      jws,
      verify_url: `${SITE_URL}/api/receipts/verify`,
      jwks_url: `${SITE_URL}/.well-known/jwks.json`,
    },
    note: "IntentFence signed live Base RPC evidence and malicious-address intelligence for five minutes. A low-risk result is not proof of identity, ownership, authorization, or future behavior. PAYMENT-RESPONSE separately proves settlement of the assessment fee.",
  };
}

export async function createSignedOfficialDataReceipt(
  decision: ReceiptDecision & {
    source: {
      publisher: "U.S. Bureau of Labor Statistics";
      api: string;
      retrieved_at: string;
      series: { headline: string; core: string };
    };
    period: { month: string };
    cpi: { headline_index: number; core_index: number };
  },
  privateJwk: string,
  payment: { network: string; asset: string; amountAtomic: string; payTo: string },
): Promise<SignedOfficialDataReceipt> {
  const issuedAtSeconds = Math.floor(new Date(decision.receipt.issued_at).getTime() / 1000);
  const claims: OfficialDataReceiptClaims = {
    iss: SITE_URL,
    aud: RECEIPT_AUDIENCE,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + RECEIPT_TTL_SECONDS,
    jti: decision.receipt.id,
    intentfence_version: "0.8",
    assurance: "official-source-data",
    request_id: decision.request_id,
    decision: decision.status,
    subject: decision.receipt.subject,
    action: decision.receipt.action,
    checks: decision.checks,
    evidence: {
      publisher: decision.source.publisher,
      retrieved_at: decision.source.retrieved_at,
      period: decision.period.month,
      series_ids: [decision.source.series.headline, decision.source.series.core],
      source_api: decision.source.api,
      headline_index: decision.cpi.headline_index,
      core_index: decision.cpi.core_index,
    },
    payment: {
      protocol: "x402-v2",
      network: payment.network,
      asset: payment.asset,
      amount_atomic: payment.amountAtomic,
      pay_to: payment.payTo,
    },
  };
  const jws = await signReceiptClaims(claims, privateJwk);
  return {
    ...decision.receipt,
    signed: true,
    assurance: "official-source-data",
    expires_at: new Date(claims.exp * 1000).toISOString(),
    payment_assurance: "x402-settled",
    payment_network: payment.network,
    payment_asset: payment.asset,
    payment_amount_atomic: payment.amountAtomic,
    pay_to: payment.payTo,
    signature: {
      format: "JWS Compact",
      alg: "ES256",
      kid: INTENTFENCE_SIGNING_KID,
      jws,
      verify_url: `${SITE_URL}/api/receipts/verify`,
      jwks_url: `${SITE_URL}/.well-known/jwks.json`,
    },
    note: "IntentFence signed the BLS publisher, source API, retrieval time, observation period, series identifiers, and index values for 24 hours. PAYMENT-RESPONSE separately proves settlement of the data fee.",
  };
}

export async function createSignedReadinessReceipt(
  decision: {
    request_id: string;
    status: "ready" | "ready_with_review" | "not_ready";
    checked_at: string;
    target: {
      origin: string;
      pathname: string;
      method: "GET" | "HEAD" | "POST";
    };
    observed: {
      http_status: number | null;
      payment_required_present: boolean;
      redirect_blocked: boolean;
    };
    checks: unknown[];
    assessment: { observed?: { payment_requirements_sha256?: string } } | null;
    receipt: {
      id: string;
      issued_at: string;
      subject: string;
      action: unknown;
    };
  },
  privateJwk: string,
  payment: { network: string; asset: string; amountAtomic: string; payTo: string },
): Promise<SignedReadinessReceipt> {
  const issuedAtSeconds = Math.floor(new Date(decision.receipt.issued_at).getTime() / 1000);
  const mappedDecision = decision.status === "ready"
    ? "safe_to_proceed"
    : decision.status === "ready_with_review"
      ? "needs_review"
      : "denied";
  const claims: ReadinessReceiptClaims = {
    iss: SITE_URL,
    aud: RECEIPT_AUDIENCE,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + ASSESSMENT_RECEIPT_TTL_SECONDS,
    jti: decision.receipt.id,
    intentfence_version: "0.9",
    assurance: "live-x402-endpoint-readiness",
    request_id: decision.request_id,
    decision: mappedDecision,
    subject: decision.receipt.subject,
    action: decision.receipt.action,
    checks: decision.checks,
    evidence: {
      checked_at: decision.checked_at,
      target_origin: decision.target.origin,
      target_pathname: decision.target.pathname,
      target_method: decision.target.method,
      http_status: decision.observed.http_status,
      payment_required_present: decision.observed.payment_required_present,
      redirect_blocked: decision.observed.redirect_blocked,
      payment_requirements_sha256:
        decision.assessment?.observed?.payment_requirements_sha256 ?? null,
    },
    payment: {
      protocol: "x402-v2",
      network: payment.network,
      asset: payment.asset,
      amount_atomic: payment.amountAtomic,
      pay_to: payment.payTo,
    },
  };
  const jws = await signReceiptClaims(claims, privateJwk);
  return {
    ...decision.receipt,
    signed: true,
    assurance: "live-x402-endpoint-readiness",
    expires_at: new Date(claims.exp * 1000).toISOString(),
    payment_assurance: "x402-settled",
    payment_network: payment.network,
    payment_asset: payment.asset,
    payment_amount_atomic: payment.amountAtomic,
    pay_to: payment.payTo,
    signature: {
      format: "JWS Compact",
      alg: "ES256",
      kid: INTENTFENCE_SIGNING_KID,
      jws,
      verify_url: `${SITE_URL}/api/receipts/verify`,
      jwks_url: `${SITE_URL}/.well-known/jwks.json`,
    },
    note: "IntentFence signed the bounded live endpoint check for five minutes. The check never paid the target, followed redirects, or forwarded credentials. Re-check the current challenge immediately before signing its payment.",
  };
}

export async function createSignedActionAuthorizationReceipt(
  decision: ActionAuthorizationDecision,
  privateJwk: string,
): Promise<SignedActionAuthorizationReceipt> {
  const issuedAtSeconds = Math.floor(new Date(decision.authorized_at).getTime() / 1000);
  const claims: ActionAuthorizationReceiptClaims = {
    iss: SITE_URL,
    aud: RECEIPT_AUDIENCE,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + ASSESSMENT_RECEIPT_TTL_SECONDS,
    jti: decision.receipt.id,
    intentfence_version: "1.0",
    assurance: "action-bound-policy-authorization",
    request_id: decision.request_id,
    decision: decision.status,
    subject: decision.subject,
    action: decision.action,
    checks: decision.checks,
    evidence: {
      authorized_at: decision.authorized_at,
      action_digest: decision.action_digest,
      policy_digest: decision.policy_digest,
      enforcement_mode: "caller-side-fail-closed",
    },
  };
  const jws = await signReceiptClaims(claims, privateJwk);
  return {
    ...decision.receipt,
    signed: true,
    assurance: "action-bound-policy-authorization",
    expires_at: new Date(claims.exp * 1000).toISOString(),
    action_digest: decision.action_digest,
    policy_digest: decision.policy_digest,
    signature: {
      format: "JWS Compact",
      alg: "ES256",
      kid: INTENTFENCE_SIGNING_KID,
      jws,
      verify_url: `${SITE_URL}/api/receipts/verify`,
      jwks_url: `${SITE_URL}/.well-known/jwks.json`,
    },
    note: "IntentFence signed the exact action and policy digests for five minutes. The caller must verify this receipt and fail closed before executing the locally bound action. The receipt does not prove the caller-supplied identity or approval source.",
  };
}

export async function verifyReceipt(
  jws: string,
  now = Date.now(),
  publicJwk: JsonWebKey = INTENTFENCE_PUBLIC_JWK,
) {
  if (jws.length < 100 || jws.length > 32_768) {
    return { valid: false as const, reason: "invalid_length" };
  }
  const segments = jws.split(".");
  if (segments.length !== 3) return { valid: false as const, reason: "invalid_compact_jws" };

  try {
    const header = base64UrlToJson(segments[0]);
    const claims = base64UrlToJson(segments[1]);
    const signature = base64UrlToBytes(segments[2]);
    if (
      !isRecord(header) ||
      header.alg !== "ES256" ||
      header.kid !== INTENTFENCE_SIGNING_KID ||
      header.typ !== "intentfence+jws" ||
      signature.byteLength !== 64
    ) {
      return { valid: false as const, reason: "unsupported_signature" };
    }
    const policyReceipt =
      isRecord(claims) &&
      claims.intentfence_version === "0.5" &&
      claims.assurance === "declared-input-policy";
    const assessmentReceipt =
      isRecord(claims) &&
      claims.intentfence_version === "0.6" &&
      claims.assurance === "caller-observed-x402-quote-assessment" &&
      isRecord(claims.evidence);
    const walletRiskReceipt =
      isRecord(claims) &&
      claims.intentfence_version === "0.7" &&
      claims.assurance === "live-base-wallet-risk" &&
      isRecord(claims.evidence);
    const officialDataReceipt =
      isRecord(claims) &&
      claims.intentfence_version === "0.8" &&
      claims.assurance === "official-source-data" &&
      isRecord(claims.evidence);
    const readinessReceipt =
      isRecord(claims) &&
      claims.intentfence_version === "0.9" &&
      claims.assurance === "live-x402-endpoint-readiness" &&
      isRecord(claims.evidence);
    const actionAuthorizationReceipt =
      isRecord(claims) &&
      claims.intentfence_version === "1.0" &&
      claims.assurance === "action-bound-policy-authorization" &&
      isRecord(claims.evidence) &&
      typeof claims.evidence.action_digest === "string" &&
      typeof claims.evidence.policy_digest === "string";
    if (
      !isRecord(claims) ||
      claims.iss !== SITE_URL ||
      claims.aud !== RECEIPT_AUDIENCE ||
      (!policyReceipt && !assessmentReceipt && !walletRiskReceipt && !officialDataReceipt && !readinessReceipt && !actionAuthorizationReceipt) ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number" ||
      typeof claims.jti !== "string" ||
      typeof claims.request_id !== "string"
    ) {
      return { valid: false as const, reason: "invalid_claims" };
    }
    const nowSeconds = Math.floor(now / 1000);
    if (claims.iat > nowSeconds + 300) return { valid: false as const, reason: "issued_in_future" };
    if (claims.exp <= nowSeconds) return { valid: false as const, reason: "expired" };
    const maxLifetime = assessmentReceipt || walletRiskReceipt || readinessReceipt || actionAuthorizationReceipt
      ? ASSESSMENT_RECEIPT_TTL_SECONDS
      : RECEIPT_TTL_SECONDS;
    if (claims.exp - claims.iat > maxLifetime) {
      return { valid: false as const, reason: "invalid_lifetime" };
    }

    const key = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature,
      new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
    );
    return verified
      ? { valid: true as const, claims: claims as VerifiableReceiptClaims }
      : { valid: false as const, reason: "invalid_signature" };
  } catch {
    return { valid: false as const, reason: "malformed_receipt" };
  }
}
