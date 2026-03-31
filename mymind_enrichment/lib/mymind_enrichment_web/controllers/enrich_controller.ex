defmodule MymindEnrichmentWeb.EnrichController do
  use MymindEnrichmentWeb, :controller

  alias MymindEnrichment.Application

  def enrich(conn, %{"card_id" => card_id}) do
    if Application.background_enrichment_enabled?() do
      MymindEnrichment.Pipeline.Producer.enqueue(card_id)
      json(conn, %{status: "queued", card_id: card_id})
    else
      conn
      |> put_status(:service_unavailable)
      |> json(%{
        status: "disabled",
        card_id: card_id,
        message: "Background enrichment is disabled in DSPy sidecar mode"
      })
    end
  end
end
