const SITE_URL = "https://agentpass-protocol.rmalka06.chatgpt.site";
const RECEIPT_AUDIENCE = "intentfence-verifier";
const RECEIPT_TTL_SECONDS = 86_400;

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

export async function signReceiptClaims(claims: ReceiptClaims, privateJwk: string) {
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
    if (
      !isRecord(claims) ||
      claims.iss !== SITE_URL ||
      claims.aud !== RECEIPT_AUDIENCE ||
      claims.intentfence_version !== "0.5" ||
      claims.assurance !== "declared-input-policy" ||
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
    if (claims.exp - claims.iat > RECEIPT_TTL_SECONDS) {
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
      ? { valid: true as const, claims: claims as ReceiptClaims }
      : { valid: false as const, reason: "invalid_signature" };
  } catch {
    return { valid: false as const, reason: "malformed_receipt" };
  }
}
