defmodule MymindEnrichmentWeb.HealthController do
  use MymindEnrichmentWeb, :controller

  alias MymindEnrichment.Application

  def index(conn, _params) do
    json(conn, %{
      status: "ok",
      service: "mymind-enrichment",
      background_enrichment: Application.background_enrichment_enabled?()
    })
  end
end
