defmodule MymindEnrichmentWeb.HealthController do
  use MymindEnrichmentWeb, :controller

  def index(conn, _params) do
    json(conn, %{status: "ok", service: "mymind-enrichment"})
  end
end
