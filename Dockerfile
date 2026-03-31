# RedwoodJS Production Dockerfile for Railway
# Builds both API and Web, serves via rw-server

FROM node:22-slim AS base

RUN corepack enable && corepack prepare yarn@4.6.0 --activate
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files first (cache layer)
COPY package.json yarn.lock .yarnrc.yml ./
COPY api/package.json api/
COPY web/package.json web/

# Install dependencies
RUN yarn install --immutable || yarn install

# Copy source
COPY redwood.toml .
COPY graphql.config.js .
COPY .env.production .
COPY api api
COPY web web

# Generate Prisma client + GraphQL types
RUN yarn rw prisma generate

# RedwoodJS reads .env.production for REDWOOD_ENV_* vars during build
ENV NODE_ENV=production
RUN yarn rw build

# Production stage
FROM node:22-slim AS production

RUN corepack enable && corepack prepare yarn@4.6.0 --activate
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=base /app /app

# Railway provides PORT env var
ENV NODE_ENV=production
EXPOSE ${PORT:-8910}

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
