import {
  evaluatePreflight,
  PreflightValidationError,
  validatePreflightInput,
} from "../../../lib/preflight";
import { JsonRequestError, readJsonWithLimit } from "../../../lib/request";
import { A2A_VERSION, a2aHeaders, a2aProblem, invalidA2AVersion } from "../../../lib/a2a";
import {
  AgentCheckoutValidationError,
  buildAgentCheckout,
} from "../../../lib/agent-checkout";
import { recordFunnelEvent } from "../../../lib/telemetry";

type A2APart = { text?: unknown; data?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: a2aHeaders });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> },
) {
  const { operation } = await context.params;
  if (operation !== "message:send") {
    return a2aProblem(404, "operation-not-found", "Operation Not Found", "The requested A2A operation is not available.");
  }
  if (invalidA2AVersion(request)) {
    return a2aProblem(
      400,
      "version-not-supported",
      "Protocol Version Not Supported",
      "IntentFence supports A2A protocol version 1.0.",
      { supportedVersions: [A2A_VERSION] },
    );
  }

  try {
    const body = await readJsonWithLimit(request);
    if (!isRecord(body) || !isRecord(body.message)) {
      throw new PreflightValidationError("message must be a JSON object.");
    }
    const message = body.message;
    if (message.role !== "ROLE_USER" || !Array.isArray(message.parts) || message.parts.length === 0 || message.parts.length > 20) {
      throw new PreflightValidationError("message must contain 1-20 parts and use role ROLE_USER.");
    }
    const parts = message.parts as A2APart[];
    const dataPart = parts.find((part) => isRecord(part) && part.data !== undefined);
    const textPart = parts.find((part) => isRecord(part) && typeof part.text === "string");
    let input: unknown = dataPart?.data;
    if (input === undefined && typeof textPart?.text === "string") {
      if (textPart.text.length > 16_384) {
        throw new PreflightValidationError("The text part is too large.");
      }
      try {
        input = JSON.parse(textPart.text) as unknown;
      } catch {
        throw new PreflightValidationError("The text part must contain a JSON preflight request.");
      }
    }
    if (isRecord(input) && input.skill === "intentfence-agent-checkout") {
      const checkout = buildAgentCheckout({
        product: input.product,
        ...(input.input === undefined ? {} : { input: input.input }),
      });
      await recordFunnelEvent({
        eventName: "checkout_selected",
        request,
        metadata: {
          protocol: "a2a",
          product: checkout.product.id,
          example_only: checkout.example_only,
        },
      });
      return new Response(
        JSON.stringify({
          message: {
            role: "ROLE_AGENT",
            parts: [{ text: JSON.stringify(checkout), data: checkout }],
            messageId: crypto.randomUUID(),
            contextId:
              typeof message.contextId === "string"
                ? message.contextId
                : crypto.randomUUID(),
          },
        }),
        { status: 200, headers: a2aHeaders },
      );
    }

    const decision = evaluatePreflight(validatePreflightInput(input));
    return new Response(
      JSON.stringify({
        message: {
          role: "ROLE_AGENT",
          parts: [{ text: JSON.stringify(decision), data: decision }],
          messageId: crypto.randomUUID(),
          contextId: typeof message.contextId === "string" ? message.contextId : crypto.randomUUID(),
        },
      }),
      { status: 200, headers: a2aHeaders },
    );
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return a2aProblem(error.status, error.code, "Invalid A2A Request", error.message);
    }
    if (error instanceof PreflightValidationError) {
      return a2aProblem(400, "invalid-parameters", "Invalid Parameters", error.message);
    }
    if (error instanceof AgentCheckoutValidationError) {
      return a2aProblem(400, "invalid-checkout", "Invalid Checkout", error.message);
    }
    return a2aProblem(500, "internal-error", "Internal Error", "The A2A message could not be processed.");
  }
}
