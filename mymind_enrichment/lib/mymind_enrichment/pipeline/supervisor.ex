defmodule MymindEnrichment.Pipeline.Supervisor do
  @moduledoc """
  Supervises the enrichment pipeline components:
  - Producer: receives card IDs from Postgres NOTIFY
  - ConsumerSupervisor: spawns a worker per card for concurrent enrichment
  """
  use Supervisor

  def start_link(_opts) do
    Supervisor.start_link(__MODULE__, [], name: __MODULE__)
  end

  @impl true
  def init(_) do
    children = [
      MymindEnrichment.Pipeline.Producer,
      {MymindEnrichment.Pipeline.ConsumerSupervisor, []}
    ]

    Supervisor.init(children, strategy: :rest_for_one)
  end
end
