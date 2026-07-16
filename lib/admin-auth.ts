export const MIN_ADMIN_TOKEN_LENGTH = 32;

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function isAdminRequestAuthorized(request: Request, configuredToken: string | null) {
  if (!configuredToken || configuredToken.length < MIN_ADMIN_TOKEN_LENGTH) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice("Bearer ".length), configuredToken);
}
