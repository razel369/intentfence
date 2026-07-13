type AgentPassRuntimeEnv = {
  AGENTPASS_SIGNING_PRIVATE_JWK?: unknown;
};

export async function getReceiptSigningPrivateJwk() {
  const processValue = globalThis.process?.env?.AGENTPASS_SIGNING_PRIVATE_JWK;
  if (typeof processValue === "string" && processValue.length > 0) return processValue;

  const { env } = await import("cloudflare:workers");
  const value = (env as unknown as AgentPassRuntimeEnv).AGENTPASS_SIGNING_PRIVATE_JWK;
  return typeof value === "string" && value.length > 0 ? value : null;
}
