export const INTENTFENCE_MCP_URL =
  "https://agentpass-protocol.rmalka06.chatgpt.site/api/mcp";

export const INTENTFENCE_VSCODE_SERVER = {
  name: "IntentFence",
  type: "http",
  url: INTENTFENCE_MCP_URL,
} as const;

export const INTENTFENCE_VSCODE_INSTALL_URL =
  `vscode:mcp/install?${encodeURIComponent(JSON.stringify(INTENTFENCE_VSCODE_SERVER))}`;

export const INTENTFENCE_VSCODE_MANUAL_CONFIG = JSON.stringify(
  {
    servers: {
      IntentFence: {
        type: "http",
        url: INTENTFENCE_MCP_URL,
      },
    },
  },
  null,
  2,
);
