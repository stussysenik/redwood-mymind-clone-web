defmodule MymindEnrichmentWeb.EnrichController do
  use MymindEnrichmentWeb, :controller

  def enrich(conn, %{"card_id" => card_id}) do
    MymindEnrichment.Pipeline.Producer.enqueue(card_id)
    json(conn, %{status: "queued", card_id: card_id})
  end
end
