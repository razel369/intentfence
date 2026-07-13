import { A2A_VERSION, a2aHeaders, a2aProblem, invalidA2AVersion } from "../../../lib/a2a";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: a2aHeaders });
}

export function GET(request: Request) {
  if (invalidA2AVersion(request)) {
    return a2aProblem(
      400,
      "version-not-supported",
      "Protocol Version Not Supported",
      "AgentPass supports A2A protocol version 1.0.",
      { supportedVersions: [A2A_VERSION] },
    );
  }
  return new Response(JSON.stringify({ tasks: [] }), { status: 200, headers: a2aHeaders });
}
