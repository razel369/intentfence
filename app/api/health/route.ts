export function GET() {
  return Response.json(
    {
      service: "IntentFence",
      version: "0.5.0",
      status: "ok",
      protocol: {
        rest: true,
        mcp: true,
        a2a: true,
        x402: true,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
