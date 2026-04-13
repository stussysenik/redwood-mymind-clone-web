-- CreateTable
CREATE TABLE "graph_clusters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "space_id" TEXT,
    "name" VARCHAR(60) NOT NULL,
    "note" VARCHAR(280),
    "node_ids" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_annotations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "anchor_type" TEXT NOT NULL,
    "anchor_id" TEXT NOT NULL,
    "text" VARCHAR(280) NOT NULL,
    "offset_x" DOUBLE PRECISION,
    "offset_y" DOUBLE PRECISION,
    "offset_z" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_graph_clusters_user_created" ON "graph_clusters"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_graph_clusters_user_space" ON "graph_clusters"("user_id", "space_id");

-- CreateIndex
CREATE INDEX "idx_graph_annotations_user_created" ON "graph_annotations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_graph_annotations_user_anchor" ON "graph_annotations"("user_id", "anchor_type", "anchor_id");
