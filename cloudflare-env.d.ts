export {};

declare global {
  interface Env {
    DB: D1Database;
    AGENTPASS_SIGNING_PRIVATE_JWK?: string;
  }

  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      AGENTPASS_SIGNING_PRIVATE_JWK?: string;
    }
  }
}

declare module "cloudflare:workers" {
  interface Env {
    DB: D1Database;
    AGENTPASS_SIGNING_PRIVATE_JWK?: string;
  }
}
