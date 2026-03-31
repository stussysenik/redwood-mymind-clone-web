defmodule MymindEnrichment.Pipeline.Producer do
  @moduledoc """
  GenStage producer that receives card IDs from Postgres NOTIFY
  and feeds them to consumer workers for enrichment.
  Also polls for stuck cards (processing: true but stale) on startup.
  """
  use GenStage

  require Logger

  @poll_interval_ms 60_000
  @stuck_threshold_minutes 5

  def start_link(_opts) do
    GenStage.start_link(__MODULE__, [], name: __MODULE__)
  end

  @doc "Enqueue a card ID for enrichment processing."
  def enqueue(card_id) when is_binary(card_id) do
    GenStage.cast(__MODULE__, {:enqueue, card_id})
  end

  # GenStage callbacks

  @impl true
  def init(_) do
    # Schedule initial poll for stuck cards
    Process.send_after(self(), :poll_stuck, 5_000)
    {:producer, %{queue: :queue.new(), demand: 0}}
  end

  @impl true
  def handle_cast({:enqueue, card_id}, %{queue: queue} = state) do
    Logger.info("[Producer] Enqueued card #{safe_card_id(card_id)}")
    queue = :queue.in(card_id, queue)
    {events, new_state} = dispatch_events(%{state | queue: queue})
    {:noreply, events, new_state}
  end

  @impl true
  def handle_demand(incoming_demand, %{demand: current_demand} = state) do
    new_state = %{state | demand: current_demand + incoming_demand}
    {events, final_state} = dispatch_events(new_state)
    {:noreply, events, final_state}
  end

  @impl true
  def handle_info(:poll_stuck, state) do
    poll_stuck_cards()
    Process.send_after(self(), :poll_stuck, @poll_interval_ms)
    {:noreply, [], state}
  end

  @impl true
  def handle_info(_msg, state) do
    {:noreply, [], state}
  end

  # Dispatch as many events as demand allows
  defp dispatch_events(%{queue: queue, demand: demand} = state) do
    {events, remaining_queue, remaining_demand} = take_events(queue, demand, [])
    {events, %{state | queue: remaining_queue, demand: remaining_demand}}
  end

  defp take_events(queue, 0, acc), do: {Enum.reverse(acc), queue, 0}

  defp take_events(queue, demand, acc) do
    case :queue.out(queue) do
      {{:value, card_id}, rest} ->
        take_events(rest, demand - 1, [card_id | acc])

      {:empty, queue} ->
        {Enum.reverse(acc), queue, demand}
    end
  end

  # Find cards stuck in processing state and re-enqueue them
  defp poll_stuck_cards do
    sql = """
    SELECT id FROM cards
    WHERE (metadata->>'processing')::boolean = true
    AND (metadata->>'enrichmentStage') != 'complete'
    AND (
      (metadata->>'enrichedAt') IS NULL
      OR (metadata->>'enrichedAt')::timestamptz < NOW() - INTERVAL '#{@stuck_threshold_minutes} minutes'
    )
    LIMIT 20
    """

    case MymindEnrichment.Repo.query_maps(sql) do
      {:ok, rows} when rows != [] ->
        Logger.info("[Producer] Found #{length(rows)} stuck cards, re-enqueueing")
        Enum.each(rows, fn %{"id" => id} -> enqueue(id) end)

      {:ok, []} ->
        :ok

      {:error, err} ->
        Logger.warning("[Producer] Failed to poll stuck cards: #{inspect(err)}")
    end
  end

  defp safe_card_id(card_id) when is_binary(card_id) and byte_size(card_id) == 16 do
    <<a1::binary-size(4), a2::binary-size(2), a3::binary-size(2), a4::binary-size(2),
      a5::binary-size(6)>> =
      Base.encode16(card_id, case: :lower)

    Enum.join([a1, a2, a3, a4, a5], "-")
  end

  defp safe_card_id(card_id), do: to_string(card_id)
end
