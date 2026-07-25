export type RequestTrafficKind =
  | "browser"
  | "agent"
  | "monitor"
  | "crawler"
  | "unknown";

export type RequestTrafficAttribution = {
  kind: RequestTrafficKind;
  family: string;
};

const knownClients = [
  { pattern: "sentineloracle", kind: "monitor", family: "sentinel-oracle" },
  { pattern: "x402-observer", kind: "monitor", family: "x402-observer" },
  { pattern: "x402-list-monitor", kind: "monitor", family: "x402-list-monitor" },
  { pattern: "x402scan", kind: "monitor", family: "x402scan" },
  { pattern: "x402scout", kind: "monitor", family: "x402scout" },
  { pattern: "uptimerobot", kind: "monitor", family: "uptime-robot" },
  { pattern: "better uptime", kind: "monitor", family: "better-uptime" },
  { pattern: "healthcheck", kind: "monitor", family: "healthcheck" },
  { pattern: "pingdom", kind: "monitor", family: "pingdom" },
  { pattern: "amazonbot", kind: "crawler", family: "amazonbot" },
  { pattern: "googlebot", kind: "crawler", family: "googlebot" },
  { pattern: "bingbot", kind: "crawler", family: "bingbot" },
  { pattern: "duckduckbot", kind: "crawler", family: "duckduckbot" },
  { pattern: "facebookexternalhit", kind: "crawler", family: "facebook-link-preview" },
  { pattern: "twitterbot", kind: "crawler", family: "x-link-preview" },
] as const;

export function classifyRequestTraffic(
  request: Pick<Request, "headers"> | undefined,
): RequestTrafficAttribution {
  const userAgent = request?.headers.get("user-agent")?.trim().toLowerCase() ?? "";
  if (!userAgent) return { kind: "unknown", family: "missing-user-agent" };

  for (const client of knownClients) {
    if (userAgent.includes(client.pattern)) {
      return { kind: client.kind, family: client.family };
    }
  }

  if (
    userAgent.includes("mozilla/") &&
    (userAgent.includes("chrome/") ||
      userAgent.includes("safari/") ||
      userAgent.includes("firefox/") ||
      userAgent.includes("edg/"))
  ) {
    return { kind: "browser", family: "web-browser" };
  }

  if (userAgent.includes("curl/")) return { kind: "agent", family: "curl" };
  if (userAgent.includes("wget/")) return { kind: "agent", family: "wget" };
  if (userAgent.includes("undici")) return { kind: "agent", family: "undici" };
  if (userAgent.includes("node")) return { kind: "agent", family: "node" };
  if (userAgent.includes("python-requests")) {
    return { kind: "agent", family: "python-requests" };
  }
  if (userAgent.includes("go-http-client")) {
    return { kind: "agent", family: "go-http-client" };
  }
  if (userAgent.includes("mcp") || userAgent.includes("agent")) {
    return { kind: "agent", family: "agent-runtime" };
  }

  return { kind: "unknown", family: "unclassified" };
}

export function paymentChallengeEventName(
  request: Pick<Request, "headers"> | undefined,
): "payment_probe" | "payment_required" {
  const traffic = classifyRequestTraffic(request);
  return traffic.kind === "monitor" || traffic.kind === "crawler"
    ? "payment_probe"
    : "payment_required";
}
