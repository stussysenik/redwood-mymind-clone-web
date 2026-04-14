# RedwoodJS Production Dockerfile for Railway
# Builds both API and Web, serves via rw-server

FROM node:22-slim AS base

RUN corepack enable && corepack prepare yarn@4.6.0 --activate
# Python 3 + pip are needed by the enrichment worker service (scripts/enrich/).
# Both the web service and the worker service build from this same image;
# Railway selects which service to run via startCommand in railway.toml.
RUN apt-get update \
  && apt-get install -y openssl python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

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
COPY api api
COPY web web
COPY scripts scripts

# Install Python deps for the enrichment worker. System-level because the
# worker container has no project venv.
RUN pip3 install --no-cache-dir --break-system-packages dspy-ai python-dotenv

# Generate Prisma client + GraphQL types
RUN yarn rw prisma generate

# Redwood inlines REDWOOD_ENV_* at build time. Default these to the same
# public values we ship in .env.production so Docker/Railway builds don't
# depend on a root dotfile being present in the upload context.
ARG REDWOOD_ENV_SUPABASE_URL=https://quxaamiuzdzpzrccohbu.supabase.co
ARG REDWOOD_ENV_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1eGFhbWl1emR6cHpyY2NvaGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5OTAxNjAsImV4cCI6MjA4MzU2NjE2MH0.H6KQO___L9bV1Uvq8t57vf3sKTLXK8p-Q1-LjMZXK6Y
ENV REDWOOD_ENV_SUPABASE_URL=$REDWOOD_ENV_SUPABASE_URL
ENV REDWOOD_ENV_SUPABASE_ANON_KEY=$REDWOOD_ENV_SUPABASE_ANON_KEY
ENV NODE_ENV=production
RUN yarn rw build

# Production stage
FROM node:22-slim AS production

RUN corepack enable && corepack prepare yarn@4.6.0 --activate
RUN apt-get update \
  && apt-get install -y openssl python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=base /app /app

# Railway provides PORT env var
ENV NODE_ENV=production
EXPOSE ${PORT:-8910}

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
