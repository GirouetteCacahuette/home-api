# syntax=docker/dockerfile:1

# tricount-actual-sync, a private repo: fetched at TRICOUNT_SYNC_REF with a
# GitHub token passed as the GIT_AUTH_TOKEN build secret (see README). The
# secret is only mounted for the fetch, never written to a layer.
FROM node:24-alpine AS tricount-sync
ARG TRICOUNT_SYNC_REF=main
WORKDIR /tricount-actual-sync
ADD --keep-git-dir=false \
  https://github.com/GirouetteCacahuette/tricount-actual-sync.git#${TRICOUNT_SYNC_REF} .
RUN npm ci && npm prune --omit=dev

# Build stage. package.json depends on file:../tricount-actual-sync, so the
# library sits next to /app, where it does in a local checkout. It is built
# already: --ignore-scripts keeps npm from re-running its prepare (tsc).
FROM node:24-alpine AS builder
COPY --from=tricount-sync /tricount-actual-sync /tricount-actual-sync
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:24-alpine AS production
COPY --from=tricount-sync /tricount-actual-sync/package.json /tricount-actual-sync/
COPY --from=tricount-sync /tricount-actual-sync/dist /tricount-actual-sync/dist
COPY --from=tricount-sync /tricount-actual-sync/node_modules /tricount-actual-sync/node_modules
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
COPY ui ./ui
# Owned by node so the named config volume starts writable, and files in the
# shared session dir stay owned by uid 1000 like the CLI's.
RUN mkdir -p /data/tricount-session /data/tricount-config \
  && chown node:node /data/tricount-session /data/tricount-config
USER node
EXPOSE 8000
CMD ["node", "dist/app.js"]
