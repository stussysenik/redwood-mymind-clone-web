defmodule MymindEnrichmentWeb.StatsController do
  use MymindEnrichmentWeb, :controller

  alias MymindEnrichment.Application

  def index(conn, _params) do
    if Application.background_enrichment_enabled?() do
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

      json(conn, %{pipeline_stats: stats, background_enrichment: true})
    else
      json(conn, %{pipeline_stats: [], background_enrichment: false})
    end
  end
end
