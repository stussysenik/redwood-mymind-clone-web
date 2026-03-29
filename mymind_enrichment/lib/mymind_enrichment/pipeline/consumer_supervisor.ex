defmodule MymindEnrichment.Pipeline.ConsumerSupervisor do
  @moduledoc """
  ConsumerSupervisor that spawns a supervised worker Task for each
  card that needs enrichment. Each card gets its own isolated process,
  so one card's failure doesn't affect others.
  """
  use ConsumerSupervisor

  require Logger

  @max_demand 5

  def start_link(opts) do
    ConsumerSupervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    children = [
      %{
        id: MymindEnrichment.Pipeline.Worker,
        start: {MymindEnrichment.Pipeline.Worker, :start_link, []},
        restart: :temporary
      }
    ]

    opts = [
      strategy: :one_for_one,
      subscribe_to: [
        {MymindEnrichment.Pipeline.Producer, max_demand: @max_demand, min_demand: 1}
      ]
    ]

    ConsumerSupervisor.init(children, opts)
  end
end
