import { leads } from "../../../db/schema";
import { getDb } from "../../../db";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      company?: string;
      useCase?: string;
      plan?: string;
      website?: string;
    };

    if (body.website) return Response.json({ ok: true }, { status: 201 });

    const email = body.email?.trim().toLowerCase();
    if (!email || !emailPattern.test(email)) {
      return Response.json({ error: "Enter a valid work email." }, { status: 400 });
    }

    const plan = ["high_assurance", "fleet", "enterprise"].includes(body.plan ?? "")
      ? body.plan!
      : "high_assurance";

    await getDb()
      .insert(leads)
      .values({
        email,
        company: body.company?.trim().slice(0, 120) || null,
        useCase: body.useCase?.trim().slice(0, 800) || null,
        plan,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: leads.email,
        set: {
          company: body.company?.trim().slice(0, 120) || null,
          useCase: body.useCase?.trim().slice(0, 800) || null,
          plan,
        },
      });

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json(
      { error: "We could not save your request. Please try again." },
      { status: 500 },
    );
  }
}
