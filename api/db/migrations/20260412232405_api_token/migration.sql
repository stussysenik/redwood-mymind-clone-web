-- CreateTable
CREATE TABLE "api_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['cards:write']::TEXT[],
    "last_used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_prefix_key" ON "api_tokens"("prefix");

-- CreateIndex
CREATE INDEX "idx_api_tokens_user" ON "api_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_api_tokens_lookup" ON "api_tokens"("prefix", "revoked_at");
