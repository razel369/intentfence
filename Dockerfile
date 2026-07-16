FROM node:22.17.0-slim

WORKDIR /app
ENV NODE_ENV=production

COPY mcp-stdio/package.json mcp-stdio/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY lib/preflight.ts ./lib/preflight.ts
COPY mcp-stdio/lib/paid-preflight.mjs ./mcp-stdio/lib/paid-preflight.mjs
COPY scripts/glama-mcp-server.mjs ./scripts/glama-mcp-server.mjs

USER node

CMD ["node", "--experimental-strip-types", "scripts/glama-mcp-server.mjs"]
