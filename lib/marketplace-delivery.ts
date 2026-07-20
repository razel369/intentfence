import { getPayanAgentDeliverySecret } from "./runtime-secrets.ts";

export const PAYANAGENT_DELIVERY_TOKEN_PARAM = "payan_token";
const MINIMUM_SECRET_LENGTH = 32;

async function sha256(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

export async function hasValidPayanAgentDeliveryToken(
  request: Request,
  expectedSecret: string | null,
) {
  if (!expectedSecret || expectedSecret.length < MINIMUM_SECRET_LENGTH) return false;
  const supplied = new URL(request.url).searchParams.get(PAYANAGENT_DELIVERY_TOKEN_PARAM);
  if (!supplied) return false;

  const [expectedDigest, suppliedDigest] = await Promise.all([
    sha256(expectedSecret),
    sha256(supplied),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= expectedDigest[index] ^ suppliedDigest[index];
  }
  return difference === 0;
}

export async function isAuthorizedPayanAgentDelivery(request: Request) {
  return await hasValidPayanAgentDeliveryToken(
    request,
    await getPayanAgentDeliverySecret(),
  );
}
