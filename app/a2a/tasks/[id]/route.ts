import { A2A_VERSION, a2aHeaders, a2aProblem, invalidA2AVersion } from "../../../../lib/a2a";

function versionError(request: Request) {
  if (!invalidA2AVersion(request)) return null;
  return a2aProblem(
    400,
    "version-not-supported",
    "Protocol Version Not Supported",
    "AgentPass supports A2A protocol version 1.0.",
    { supportedVersions: [A2A_VERSION] },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: a2aHeaders });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const error = versionError(request);
  if (error) return error;
  const { id } = await context.params;
  return a2aProblem(404, "task-not-found", "Task Not Found", `No task exists with id ${id}. AgentPass preflights return synchronous Message responses.`);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const error = versionError(request);
  if (error) return error;
  const { id } = await context.params;
  if (!id.endsWith(":cancel")) {
    return a2aProblem(404, "operation-not-found", "Operation Not Found", "The requested task operation is not available.");
  }
  const taskId = id.slice(0, -":cancel".length);
  return a2aProblem(404, "task-not-found", "Task Not Found", `No task exists with id ${taskId}. AgentPass preflights complete synchronously.`);
}
