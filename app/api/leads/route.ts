import { leads } from "../../../db/schema";
import { getDb } from "../../../db";
import { normalizeLeadPlan } from "../../../lib/lead-intake";
import { JsonRequestError, readJsonWithLimit } from "../../../lib/request";
import { recordFunnelEvent } from "../../../lib/telemetry";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEAD_BODY_BYTES = 8_192;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  try {
    const body = await readJsonWithLimit(request, MAX_LEAD_BODY_BYTES);
    if (!isRecord(body)) {
      await recordFunnelEvent({
        eventName: "lead_rejected",
        request,
        metadata: { reason: "invalid_body" },
      });
      return Response.json({ error: "Send a valid lead request." }, { status: 400 });
    }

    if (body.website) {
      await recordFunnelEvent({ eventName: "lead_spam_filtered", request });
      return Response.json({ ok: true }, { status: 201 });
    }

    const email = optionalString(body.email)?.trim().toLowerCase();
    if (!email || email.length > 320 || !emailPattern.test(email)) {
      await recordFunnelEvent({
        eventName: "lead_rejected",
        request,
        metadata: { reason: "invalid_email" },
      });
      return Response.json({ error: "Enter a valid work email." }, { status: 400 });
    }

    const company = optionalString(body.company)?.trim().slice(0, 120) || null;
    const useCase = optionalString(body.useCase)?.trim().slice(0, 800) || null;
    const plan = normalizeLeadPlan(body.plan);

    await getDb()
      .insert(leads)
      .values({
        email,
        company,
        useCase,
        plan,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: leads.email,
        set: {
          company,
          useCase,
          plan,
        },
      });

    await recordFunnelEvent({
      eventName: "lead_submitted",
      request,
      metadata: {
        plan,
        has_company: company !== null,
        has_use_case: useCase !== null,
      },
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof JsonRequestError) {
      await recordFunnelEvent({
        eventName: "lead_rejected",
        request,
        metadata: { reason: error.code },
      });
      return Response.json(
        { error: error.message },
        { status: error.status },
      );
    }
    await recordFunnelEvent({
      eventName: "lead_rejected",
      request,
      metadata: { reason: "storage_error" },
    });
    return Response.json(
      { error: "We could not save your request. Please try again." },
      { status: 500 },
    );
  }
}
