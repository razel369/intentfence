import {
  AgentCheckoutValidationError,
  buildAgentCheckout,
  listAgentCheckoutProducts,
} from "../../../lib/agent-checkout";
import { JsonRequestError, readJsonWithLimit } from "../../../lib/request";
import { recordFunnelEvent } from "../../../lib/telemetry";

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};
const catalogHeaders = {
  ...baseHeaders,
  "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
};
const dynamicHeaders = { ...baseHeaders, "Cache-Control": "no-store" };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: baseHeaders });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const product = url.searchParams.get("product");

  try {
    if (product) {
      const checkout = buildAgentCheckout({ product });
      await recordFunnelEvent({
        eventName: "checkout_discovered",
        request,
        metadata: {
          protocol: "rest",
          product: checkout.product.id,
          example_only: true,
        },
      });
      return Response.json(checkout, { headers: catalogHeaders });
    }

    await recordFunnelEvent({
      eventName: "checkout_discovered",
      request,
      metadata: { protocol: "rest", products: 6 },
    });
    return Response.json(
      {
        intentfence: "agent-checkout-catalog-1.0",
        purpose:
          "Choose a paid outcome, generate an exact capped request, and execute it with any x402-capable agent wallet or the IntentFence MCP.",
        create_checkout: {
          method: "POST",
          url: "https://agentpass-protocol.rmalka06.chatgpt.site/api/checkout",
          body: {
            product: "wallet-risk",
            input: { address: "0x1111111111111111111111111111111111111111" },
          },
        },
        products: listAgentCheckoutProducts(),
        safety: [
          "No payment is initiated by this catalog.",
          "Every generated checkout pins an exact maximum amount.",
          "The buyer wallet signs locally and must require settlement proof.",
        ],
      },
      { headers: catalogHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        error: "invalid_checkout",
        message:
          error instanceof AgentCheckoutValidationError
            ? error.message
            : "The checkout could not be generated.",
      },
      { status: 400, headers: dynamicHeaders },
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = await readJsonWithLimit(request, 24_576);
    const checkout = buildAgentCheckout(input);
    await recordFunnelEvent({
      eventName: "checkout_selected",
      request,
      metadata: {
        protocol: "rest",
        product: checkout.product.id,
        example_only: checkout.example_only,
      },
    });
    return Response.json(checkout, { headers: dynamicHeaders });
  } catch (error) {
    const knownError =
      error instanceof AgentCheckoutValidationError || error instanceof JsonRequestError;
    return Response.json(
      {
        error: "invalid_checkout",
        message: knownError
          ? error.message
          : "The checkout could not be generated.",
      },
      {
        status: error instanceof JsonRequestError ? error.status : 400,
        headers: dynamicHeaders,
      },
    );
  }
}
