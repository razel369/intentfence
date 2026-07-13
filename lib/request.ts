const JSON_CONTENT_TYPES = ["application/json", "+json"];

export class JsonRequestError extends Error {
  constructor(
    public readonly code: "invalid_content_type" | "invalid_json" | "payload_too_large",
    message: string,
    public readonly status: 400 | 413 | 415,
  ) {
    super(message);
    this.name = "JsonRequestError";
  }
}

export async function readJsonWithLimit(request: Request, maxBytes = 16_384): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase();
  if (contentType && !JSON_CONTENT_TYPES.some((value) => contentType.includes(value))) {
    throw new JsonRequestError(
      "invalid_content_type",
      "Send the request as application/json.",
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new JsonRequestError(
      "payload_too_large",
      `The JSON body must be ${maxBytes} bytes or smaller.`,
      413,
    );
  }

  if (!request.body) {
    throw new JsonRequestError("invalid_json", "Send a valid JSON request body.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new JsonRequestError(
        "payload_too_large",
        `The JSON body must be ${maxBytes} bytes or smaller.`,
        413,
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new JsonRequestError("invalid_json", "Send a valid JSON request body.", 400);
  }
}
