import { evaluatePreflight, type PreflightInput } from "../../../lib/preflight";

type A2APart = { text?: string; data?: PreflightInput };

export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> },
) {
  const { operation } = await context.params;
  if (operation !== "message:send") {
    return Response.json({ error: "operation_not_found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      message?: { parts?: A2APart[] };
    };
    const part = body.message?.parts?.[0];
    let input: PreflightInput = part?.data ?? {};

    if (!part?.data && part?.text) {
      try {
        input = JSON.parse(part.text) as PreflightInput;
      } catch {
        input = {};
      }
    }

    const decision = evaluatePreflight(input);
    return new Response(
      JSON.stringify({
        message: {
          role: "ROLE_AGENT",
          parts: [{ text: JSON.stringify(decision), data: decision }],
          messageId: crypto.randomUUID(),
        },
      }),
      {
        headers: {
          "Content-Type": "application/a2a+json",
          "A2A-Version": "1.0",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch {
    return Response.json({ error: "invalid_a2a_message" }, { status: 400 });
  }
}
