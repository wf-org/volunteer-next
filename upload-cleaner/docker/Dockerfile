# ============================================
# Stage 1: Dependencies Installation Stage
# ============================================

# IMPORTANT: Node.js Version Maintenance
# The Node.js version specified in this Dockerfile should be kept in sync 
# with the version defined in the .nvmrc file at the root of the project.
ARG NODE_VERSION=24.7.0-slim

FROM node:${NODE_VERSION} AS dependencies

# Set working directory
WORKDIR /app

# Copy package-related files first to leverage Docker's caching mechanism
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./

# Install project dependencies with frozen lockfile for reproducible builds.
# Keep this BuildKit-free so builds work without extra Docker flags.
RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      echo "No lockfile found." && exit 1; \
    fi

# ============================================
# Stage 2: AWS Lambda image (build with --target lambda)
# Invoked on a schedule by EventBridge; handler is lambda.handler.
# ============================================

FROM public.ecr.aws/lambda/nodejs:26 AS lambda

ENV NODE_ENV=production

COPY --from=dependencies /app/node_modules ${LAMBDA_TASK_ROOT}/node_modules
COPY . ${LAMBDA_TASK_ROOT}/

CMD ["lambda.handler"]

# ============================================
# Stage 3: Run worker application (default; long-running cron for docker compose)
# ============================================

FROM node:${NODE_VERSION} AS runner

# Set working directory
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production

# Copy project dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy worker script
COPY . .

# Start the worker application
CMD ["node", "index.ts"]
