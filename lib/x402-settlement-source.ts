export function classifySettlementSource(request: Request) {
  const userAgent = request.headers.get("user-agent") ?? "";
  return /^Tollbooth-(?:Verifier|PaidCall)\//i.test(userAgent)
    ? "platform_verification"
    : "external";
}
