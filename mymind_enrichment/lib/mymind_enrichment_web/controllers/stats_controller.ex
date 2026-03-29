defmodule MymindEnrichmentWeb.StatsController do
  use MymindEnrichmentWeb, :controller

  def index(conn, _params) do
    # Query pipeline stats from DB
    stats =
      case MymindEnrichment.Repo.query_maps("""
        SELECT
          metadata->>'tagsSource' as source,
          metadata->>'enrichmentStage' as stage,
          COUNT(*) as count
        FROM "Card"
        WHERE metadata IS NOT NULL
        GROUP BY source, stage
        ORDER BY count DESC
      """) do
        {:ok, rows} -> rows
        {:error, _} -> []
      end

    json(conn, %{pipeline_stats: stats})
  end
end
