# community-site – Next.js (standalone), nur linux/arm64 (Cluster-Worker sind Raspberry Pis)

# ---- Abhängigkeiten
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Laufzeit
FROM dhi.io/node:24 AS runner
LABEL org.opencontainers.image.source="https://github.com/guidoffm/community-site" \
      org.opencontainers.image.description="community-site (15k) – Communities, Nachrichten, Events und Fotos" \
      org.opencontainers.image.licenses="Apache-2.0"
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# SQL-Migrationen werden beim Start angewendet
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3000
CMD ["node", "server.js"]
