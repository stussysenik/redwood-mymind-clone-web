defmodule MymindEnrichment.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    # Sentry logger handler — only forwards Logger.error to Sentry (budget-safe)
    :logger.add_handler(:sentry_handler, Sentry.LoggerHandler, %{
      config: %{metadata: [:request_id, :card_id]},
      level: :error
    })

    children =
      [
        # Telemetry
        MymindEnrichmentWeb.Telemetry,
        {DNSCluster,
         query: Application.get_env(:mymind_enrichment, :dns_cluster_query) || :ignore},
        {Phoenix.PubSub, name: MymindEnrichment.PubSub},

        # HTTP connection pools
        {Finch, name: MymindEnrichment.Finch, pools: finch_pools()},
        # Phoenix endpoint (API + LiveDashboard)
        MymindEnrichmentWeb.Endpoint
      ] ++ background_children()

    opts = [strategy: :one_for_one, name: MymindEnrichment.Supervisor]
    Supervisor.start_link(children, opts)
  end

  def background_enrichment_enabled? do
    System.get_env("BACKGROUND_ENRICHMENT_ENABLED") == "true"
  end

  @impl true
  def config_change(changed, _new, removed) do
    MymindEnrichmentWeb.Endpoint.config_change(changed, removed)
    :ok
  end

  defp finch_pools do
    %{
      :default => [size: 10],
      # NVIDIA NIM pool (Kimi K2.5 — primary classifier)
      "https://integrate.api.nvidia.com" => [size: 5, count: 2],
      # GLM API pool (fallback classifier)
      "https://api.z.ai" => [size: 5, count: 2],
      # Gemini embeddings pool
      "https://generativelanguage.googleapis.com" => [size: 5, count: 2]
    }
  end

  defp background_children do
    if background_enrichment_enabled?() do
      [
        # Database connection for NOTIFY listener
        MymindEnrichment.Repo,

        # Enrichment pipeline supervisor
        MymindEnrichment.Pipeline.Supervisor
      ]
    else
      []
    end
  end
end
