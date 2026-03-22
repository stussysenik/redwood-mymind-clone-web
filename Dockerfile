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
COPY .yarn .yarn

# Install dependencies
RUN yarn install --immutable || yarn install

# Copy source
COPY redwood.toml .
COPY graphql.config.js .
COPY api api
COPY web web

# Generate Prisma client + GraphQL types
RUN yarn rw prisma generate

# Build args for client-side env vars (Redwood inlines these at build time)
ARG REDWOOD_ENV_SUPABASE_URL
ARG REDWOOD_ENV_SUPABASE_ANON_KEY
ENV REDWOOD_ENV_SUPABASE_URL=$REDWOOD_ENV_SUPABASE_URL
ENV REDWOOD_ENV_SUPABASE_ANON_KEY=$REDWOOD_ENV_SUPABASE_ANON_KEY

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
