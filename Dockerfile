# syntax=docker/dockerfile:1
# Image applicative RapportEnfance IA (Node.js 22, utilisateur non privilégié).
# Aucune donnée ni secret n'est inclus dans l'image : tout passe par les variables d'environnement.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app --home /app app
# node_modules complet : CLI Prisma (migrations) et tsx (scripts d'exploitation) sont nécessaires en production
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/scripts ./scripts
COPY --from=build --chown=app:app /app/src ./src
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/connexion').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Applique les migrations versionnées puis démarre le serveur
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -H 0.0.0.0 -p ${PORT}"]
