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
  status: "safe_to_proceed" | "needs_review" | "denied";
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

export type VerifiableReceiptClaims = ReceiptClaims | AssessmentReceiptClaims;

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
    if (
      !isRecord(claims) ||
      claims.iss !== SITE_URL ||
      claims.aud !== RECEIPT_AUDIENCE ||
      (!policyReceipt && !assessmentReceipt) ||
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
    const maxLifetime = assessmentReceipt
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
