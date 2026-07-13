import { JsonRequestError, readJsonWithLimit } from "../../../../lib/request";
import { verifyReceipt } from "../../../../lib/receipts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request) {
  try {
    const body = await readJsonWithLimit(request, 36_000);
    if (!isRecord(body) || typeof body.jws !== "string") {
      return Response.json(
        { valid: false, reason: "jws_required" },
        { status: 400, headers },
      );
    }
    const result = await verifyReceipt(body.jws);
    return Response.json(result, { status: result.valid ? 200 : 400, headers });
  } catch (error) {
    if (error instanceof JsonRequestError) {
      return Response.json(
        { valid: false, reason: error.code, message: error.message },
        { status: error.status, headers },
      );
    }
    return Response.json(
      { valid: false, reason: "verification_failed" },
      { status: 500, headers },
    );
  }
}
