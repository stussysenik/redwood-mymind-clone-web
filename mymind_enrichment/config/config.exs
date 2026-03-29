# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :mymind_enrichment,
  generators: [timestamp_type: :utc_datetime]

# Configure the endpoint
config :mymind_enrichment, MymindEnrichmentWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: MymindEnrichmentWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: MymindEnrichment.PubSub,
  live_view: [signing_salt: "qshp2OmC"]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id, :card_id]

# Sentry error tracking (DSN set in runtime.exs from env)
config :sentry,
  environment_name: config_env(),
  enable_source_code_context: true,
  root_source_code_paths: [File.cwd!()]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
