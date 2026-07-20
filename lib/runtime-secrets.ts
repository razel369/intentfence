type IntentFenceRuntimeEnv = {
  INTENTFENCE_SIGNING_PRIVATE_JWK?: unknown;
  INTENTFENCE_ADMIN_TOKEN?: unknown;
  PAYANAGENT_DELIVERY_SECRET?: unknown;
};

async function runtimeSecret(name: keyof IntentFenceRuntimeEnv) {
  const processValue = globalThis.process?.env?.[name];
  if (typeof processValue === "string" && processValue.length > 0) return processValue;

  const { env } = await import("cloudflare:workers");
  const value = (env as unknown as IntentFenceRuntimeEnv)[name];
  return typeof value === "string" && value.length > 0 ? value : null;
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
