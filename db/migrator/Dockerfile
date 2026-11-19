# Migration runner. Build context: db/ (needs both migrator/ and scripts/)
#   docker build -f db/migrator/Dockerfile --target lambda db

# Keep in sync with .nvmrc
ARG NODE_VERSION=24.7.0-slim

FROM node:${NODE_VERSION} AS dependencies
WORKDIR /app
COPY migrator/package.json migrator/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev --no-audit --no-fund

# ============================================
# AWS Lambda image (--target lambda); handler is lambda.handler
# ============================================
FROM public.ecr.aws/lambda/nodejs:26 AS lambda
ENV NODE_ENV=production
COPY --from=dependencies /app/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY migrator/ ${LAMBDA_TASK_ROOT}/
COPY scripts ${LAMBDA_TASK_ROOT}/scripts
CMD ["lambda.handler"]

# ============================================
# One-shot runner for docker compose (default)
# ============================================
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production
WORKDIR /app/migrator
COPY --from=dependencies /app/node_modules ./node_modules
COPY migrator/ ./
COPY scripts ../scripts
CMD ["node", "cli.ts"]
