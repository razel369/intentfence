type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type FacilitatorKind = {
  x402Version?: unknown;
  scheme?: unknown;
  network?: unknown;
};

export type FacilitatorReadiness = {
  reachable: boolean;
  supportsRoute: boolean;
};

export function supportsIntentFenceRoute(payload: unknown, network: string) {
  if (!payload || typeof payload !== "object") return false;
  const kinds = (payload as { kinds?: unknown }).kinds;
  if (!Array.isArray(kinds)) return false;

  return kinds.some((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const kind = candidate as FacilitatorKind;
    return (
      kind.x402Version === 2 &&
      kind.scheme === "exact" &&
      kind.network === network
    );
  });
}

export async function checkIntentFenceFacilitator(
  facilitatorUrl: string,
  network: string,
  fetchImpl: FetchLike = fetch,
): Promise<FacilitatorReadiness> {
  const response = await fetchImpl(`${facilitatorUrl}/supported`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4_000),
  });

  if (!response.ok) {
    return { reachable: false, supportsRoute: false };
  }

  return {
    reachable: true,
    supportsRoute: supportsIntentFenceRoute(await response.json(), network),
  };
}
