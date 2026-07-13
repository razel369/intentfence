import { evaluatePreflight, type PreflightInput } from "../../../lib/preflight";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function GET() {
  return Response.json(
    {
      name: "AgentPass Preflight API",
      version: "0.2",
      method: "POST",
      documentation: "/openapi.json",
      discovery: "/.well-known/agentpass.json",
    },
    { headers: corsHeaders },
  );
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as PreflightInput;
    return Response.json(evaluatePreflight(input), { headers: corsHeaders });
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Send a valid JSON preflight request." },
      { status: 400, headers: corsHeaders },
    );
  }
}
