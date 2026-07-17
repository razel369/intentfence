// Sites reserves the top-level /mcp path before the application worker runs.
// Publish the same stateless Streamable HTTP MCP handler under /api/mcp.
export { GET, OPTIONS, POST } from "../../mcp/route";
