export const latestProtocolVersion = "2025-11-25";

export const supportedProtocolVersions = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  latestProtocolVersion,
]);

export function negotiateProtocolVersion(requested) {
  return typeof requested === "string" && supportedProtocolVersions.has(requested)
    ? requested
    : latestProtocolVersion;
}
