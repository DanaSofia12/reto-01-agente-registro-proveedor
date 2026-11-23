# ─── build del front ──────────────────────────────────────────────────────────
FROM oven/bun:1.4-alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ─── runtime: un proceso sirve /api/* y los estáticos ─────────────────────────
FROM oven/bun:1.4-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/web/dist ./web/dist
COPY src ./src
COPY agent ./agent
COPY fixtures ./fixtures
COPY demo.ts ./

# No-root: limita el daño de un compromiso (NFR Seguridad).
RUN mkdir -p /app/out && chown -R bun:bun /app
USER bun

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Arranca el binario directamente para que reciba SIGTERM.
CMD ["bun", "src/server.ts"]
