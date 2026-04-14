-- AlterTable: add enrichment confidence + tombstone columns to cards
ALTER TABLE "cards" ADD COLUMN "title_confidence" DOUBLE PRECISION;
ALTER TABLE "cards" ADD COLUMN "description_confidence" DOUBLE PRECISION;
ALTER TABLE "cards" ADD COLUMN "title_edited_at" TIMESTAMPTZ;
ALTER TABLE "cards" ADD COLUMN "description_edited_at" TIMESTAMPTZ;

-- CreateIndex: least-confident-first sweeps
CREATE INDEX "idx_cards_title_confidence" ON "cards"("title_confidence");

-- CreateTable: enrichment_review_items
CREATE TABLE "enrichment_review_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "card_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "proposed_value" TEXT NOT NULL,
    "current_value" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "critique" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "resolution" TEXT,
    "edited_value" TEXT,

    CONSTRAINT "enrichment_review_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_enrichment_review_pending" ON "enrichment_review_items"("user_id", "resolved_at", "created_at");
CREATE INDEX "idx_enrichment_review_card" ON "enrichment_review_items"("card_id");

ALTER TABLE "enrichment_review_items"
  ADD CONSTRAINT "enrichment_review_items_card_id_fkey"
  FOREIGN KEY ("card_id") REFERENCES "cards"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: enrichment_batch_stats
CREATE TABLE "enrichment_batch_stats" (
    "batch_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "cards_processed" INTEGER NOT NULL DEFAULT 0,
    "auto_applied" INTEGER NOT NULL DEFAULT 0,
    "queued_for_review" INTEGER NOT NULL DEFAULT 0,
    "dropped" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "enrichment_batch_stats_pkey" PRIMARY KEY ("batch_id")
);

CREATE INDEX "idx_enrichment_batch_stats_started" ON "enrichment_batch_stats"("started_at" DESC);
