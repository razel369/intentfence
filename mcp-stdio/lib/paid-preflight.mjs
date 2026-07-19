const SITE_URL = (process.env.INTENTFENCE_BASE_URL ??
  "https://agentpass-protocol.rmalka06.chatgpt.site").replace(/\/$/u, "");
const PAYMENT_META_KEY = "x402/payment";
const PAYMENT_RESPONSE_META_KEY = "x402/payment-response";

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decode(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function responseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: "invalid_remote_response", message: text.slice(0, 500) };
  }
}

function paymentRequiredResult(paymentRequired) {
  return {
    content: [{ type: "text", text: JSON.stringify(paymentRequired) }],
    structuredContent: paymentRequired,
    isError: true,
  };
}

export function createPaidIntentFenceHandler({
  validateInput,
  source,
  endpoint,
  failureMessage,
  method = "POST",
  query,
}) {
  return async (arguments_, extra) => {
    try {
      const input = validateInput(arguments_);
      const paidEndpoint = new URL(`${SITE_URL}${endpoint}`);
      if (query) {
        for (const [key, value] of Object.entries(query(input))) {
          paidEndpoint.searchParams.set(key, value);
        }
      }
      const payment = extra?._meta?.[PAYMENT_META_KEY];
      const headers = {
        "X-IntentFence-Source": source,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      };
      if (payment && typeof payment === "object") {
        headers["PAYMENT-SIGNATURE"] = encode(payment);
      }

      const response = await fetch(paidEndpoint, {
        method,
        headers,
        ...(method === "POST" ? { body: JSON.stringify(input) } : {}),
      });
      const body = await responseJson(response);

      if (response.status === 402) {
        const paymentRequired = decode(response.headers.get("payment-required"));
        if (!paymentRequired) throw new Error("The remote service omitted PAYMENT-REQUIRED.");
        return paymentRequiredResult(paymentRequired);
      }

      if (!response.ok) {
        return {
          content: [{
            type: "text",
            text: typeof body?.message === "string"
              ? body.message
              : failureMessage,
          }],
          isError: true,
        };
      }

      const paymentResponseHeader = response.headers.get("payment-response");
      const paymentResponse = decode(paymentResponseHeader) ?? paymentResponseHeader;
      return {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        structuredContent: body,
        ...(paymentResponse
          ? { _meta: { [PAYMENT_RESPONSE_META_KEY]: paymentResponse } }
          : {}),
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: error instanceof Error
            ? error.message
            : failureMessage,
        }],
        isError: true,
      };
    }
  };
}

export function createPaidPreflightHandler({ validateInput, source }) {
  return createPaidIntentFenceHandler({
    validateInput,
    source,
    endpoint: "/api/preflight/verified",
    failureMessage: "The verified IntentFence preflight could not be processed.",
  });
}
