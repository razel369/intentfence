FROM node:22.17.0-slim

WORKDIR /app
ENV NODE_ENV=production

COPY mcp-stdio/package.json mcp-stdio/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY mcp-stdio/lib ./mcp-stdio/lib
COPY scripts/glama-mcp-server.mjs ./scripts/glama-mcp-server.mjs

USER node

CMD ["node", "scripts/glama-mcp-server.mjs"]
