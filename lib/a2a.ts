export const A2A_VERSION = "1.0";

export const a2aHeaders = {
  "Content-Type": "application/a2a+json",
  "A2A-Version": A2A_VERSION,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, A2A-Version, A2A-Extensions",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function a2aProblem(
  status: number,
  slug: string,
  title: string,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({
      type: `https://a2a-protocol.org/errors/${slug}`,
      title,
      status,
      detail,
      ...extra,
    }),
    {
      status,
      headers: { ...a2aHeaders, "Content-Type": "application/problem+json" },
    },
  );
}

export function invalidA2AVersion(request: Request) {
  const version = request.headers.get("A2A-Version");
  return Boolean(version && version !== "1.0" && version !== "1.0.0");
}
