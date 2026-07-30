type IntentFenceRuntimeEnv = {
  INTENTFENCE_SIGNING_PRIVATE_JWK?: unknown;
  INTENTFENCE_ADMIN_TOKEN?: unknown;
  PAYANAGENT_DELIVERY_SECRET?: unknown;
  CDP_API_KEY_ID?: unknown;
  CDP_API_KEY_SECRET?: unknown;
};

async function runtimeSecret(name: keyof IntentFenceRuntimeEnv) {
  const processValue = globalThis.process?.env?.[name];
  if (typeof processValue === "string" && processValue.length > 0) return processValue;

  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as unknown as IntentFenceRuntimeEnv)[name];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function getReceiptSigningPrivateJwk() {
  return await runtimeSecret("INTENTFENCE_SIGNING_PRIVATE_JWK");
}

export async function getIntentFenceAdminToken() {
  return await runtimeSecret("INTENTFENCE_ADMIN_TOKEN");
}

export async function getPayanAgentDeliverySecret() {
  return await runtimeSecret("PAYANAGENT_DELIVERY_SECRET");
}

export async function getCdpFacilitatorCredentials() {
  const [apiKeyId, apiKeySecret] = await Promise.all([
    runtimeSecret("CDP_API_KEY_ID"),
    runtimeSecret("CDP_API_KEY_SECRET"),
  ]);
  return apiKeyId && apiKeySecret ? { apiKeyId, apiKeySecret } : null;
}
