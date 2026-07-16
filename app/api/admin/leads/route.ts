import { desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { leads } from "../../../../db/schema";
import { isAdminRequestAuthorized } from "../../../../lib/admin-auth";
import { getIntentFenceAdminToken } from "../../../../lib/runtime-secrets";

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const configuredToken = await getIntentFenceAdminToken();
  if (!configuredToken) {
    return Response.json(
      { error: "Lead administration is not configured." },
      { status: 503, headers: responseHeaders },
    );
  }
  if (!isAdminRequestAuthorized(request, configuredToken)) {
    return Response.json(
      { error: "Unauthorized." },
      {
        status: 401,
        headers: { ...responseHeaders, "WWW-Authenticate": "Bearer" },
      },
    );
  }

  const rows = await getDb()
    .select({
      id: leads.id,
      email: leads.email,
      company: leads.company,
      useCase: leads.useCase,
      plan: leads.plan,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .orderBy(desc(leads.createdAt))
    .limit(100);

  return Response.json(
    { count: rows.length, leads: rows },
    { headers: responseHeaders },
  );
}
