defmodule MymindEnrichmentWeb.Router do
  use MymindEnrichmentWeb, :router

  import Phoenix.LiveDashboard.Router

  pipeline :api do
    plug :accepts, ["json"]
  end

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  # DSPy-compatible sync endpoints for the Redwood API client
  scope "/", MymindEnrichmentWeb do
    pipe_through :api

    get "/health", DspyCompatController, :health
    post "/extract/title", DspyCompatController, :extract_title
    post "/generate/summary", DspyCompatController, :generate_summary
    post "/generate/tags", DspyCompatController, :generate_tags
  end

  # API endpoints
  scope "/api", MymindEnrichmentWeb do
    pipe_through :api

    # Health check
    get "/health", HealthController, :index

    # Manual enrichment trigger
    post "/enrich/:card_id", EnrichController, :enrich

    # Pipeline stats
    get "/stats", StatsController, :index
  end

  # LiveDashboard for observability (dev/staging only in production)
  scope "/" do
    pipe_through :browser
    live_dashboard "/dashboard", metrics: MymindEnrichmentWeb.Telemetry
  end
end
