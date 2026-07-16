const SITE_URL = (process.env.INTENTFENCE_BASE_URL ??
  "https://agentpass-protocol.rmalka06.chatgpt.site").replace(/\/$/u, "");
const PAID_ENDPOINT = `${SITE_URL}/api/preflight/verified`;
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

export function createPaidPreflightHandler({ validateInput, source }) {
  return async (arguments_, extra) => {
    try {
      const input = validateInput(arguments_);
      const payment = extra?._meta?.[PAYMENT_META_KEY];
      const headers = {
        "Content-Type": "application/json",
        "X-IntentFence-Source": source,
      };
      if (payment && typeof payment === "object") {
        headers["PAYMENT-SIGNATURE"] = encode(payment);
      }

      const response = await fetch(PAID_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
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
              : "The verified IntentFence preflight could not be processed.",
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
            : "The verified IntentFence preflight could not be processed.",
        }],
        isError: true,
      };
    }
  };
}
