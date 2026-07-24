import {
  guardCloudflareAgentAction,
  type IntentFenceAuthorization,
} from "../cloudflare-agents/intentfence-guard";

export type McpToolCall = {
  server: string;
  name: string;
  arguments: Record<string, unknown>;
};

async function sha256Json(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes),
  );
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Wrap the gateway's own tools/call forwarding callback. IntentFence signs the
 * descriptor; the gateway remains responsible for MCP authentication and
 * downstream authorization.
 */
export async function guardMcpToolCall<T>(
  subject: string,
  toolCall: McpToolCall,
  policy: IntentFenceAuthorization["policy"],
  context: IntentFenceAuthorization["context"],
  execute: () => Promise<T>,
) {
  const payloadHash = await sha256Json(toolCall.arguments);
  return await guardCloudflareAgentAction(
    {
      subject,
      action: {
        type: toolCall.name,
        resource: `mcp://${toolCall.server}/tools/${toolCall.name}`,
        protocol: "mcp",
        method: "tools/call",
        payload_sha256: payloadHash,
      },
      context,
      policy,
    },
    execute,
  );
}
