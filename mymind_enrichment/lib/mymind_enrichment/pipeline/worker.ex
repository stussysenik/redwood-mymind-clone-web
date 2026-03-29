defmodule MymindEnrichment.Pipeline.Worker do
  @moduledoc """
  Per-card enrichment worker. Each card is processed in an isolated
  supervised Task, so failures are contained.

  Pipeline stages:
  1. Fetch card from DB
  2. Scrape URL content (if needed)
  3. Classify via GLM-4.7 (with quality gate)
  4. Enhance via DSPy (circuit breaker)
  5. Generate embedding
  6. Extract dominant colors
  7. Write enriched data to DB
  """
  use Task, restart: :temporary

  require Logger

  alias MymindEnrichment.Pipeline.{Scraper, Classifier, QualityGate}
  alias MymindEnrichment.Repo

  @pipeline_timeout_ms 120_000

  def start_link(card_id) do
    Task.start_link(__MODULE__, :run, [card_id])
  end

  def run(card_id) do
    Logger.info("[Worker] Starting enrichment for card #{card_id}")
    started_at = System.monotonic_time(:millisecond)

    task = Task.async(fn -> run_pipeline(card_id) end)

    case Task.yield(task, @pipeline_timeout_ms) || Task.shutdown(task) do
      {:ok, :ok} ->
        duration = System.monotonic_time(:millisecond) - started_at
        Logger.info("[Worker] Card #{card_id} enriched in #{duration}ms")

        :telemetry.execute(
          [:enrichment, :pipeline, :complete],
          %{duration: duration},
          %{card_id: card_id}
        )

      {:ok, {:error, reason}} ->
        Logger.error("[Worker] Card #{card_id} failed: #{inspect(reason)}")
        apply_fallback(card_id, reason)

      {:exit, reason} ->
        Logger.error("[Worker] Card #{card_id} crashed: #{inspect(reason)}")
        apply_fallback(card_id, "Worker crashed: #{inspect(reason)}")

      nil ->
        Logger.error("[Worker] Card #{card_id} timed out after #{@pipeline_timeout_ms}ms")
        apply_fallback(card_id, "Pipeline timeout after #{@pipeline_timeout_ms}ms")
    end
  end

  defp run_pipeline(card_id) do
    with {:ok, raw_card} <- fetch_card(card_id),
         card = normalize_card(raw_card),
         :ok <- set_stage(card_id, "scraping"),
         {:ok, content} <- maybe_scrape(card),
         :ok <- set_stage(card_id, "classifying"),
         {:ok, classification} <- Classifier.classify(card, content),
         {:ok, validated} <- QualityGate.validate(card_id, classification),
         :ok <- write_enriched(card_id, validated) do
      :ok
    else
      {:error, reason} -> {:error, reason}
    end
  end

  defp fetch_card(card_id) do
    sql = """
    SELECT id, url, content, title, image_url, tags, metadata, type
    FROM cards
    WHERE id = $1
    """

    case Repo.query_maps(sql, [card_id]) do
      {:ok, [card]} -> {:ok, card}
      {:ok, []} -> {:error, "Card #{card_id} not found"}
      {:error, err} -> {:error, "DB error: #{inspect(err)}"}
    end
  end

  defp set_stage(card_id, stage) do
    # Always fetch fresh metadata to avoid stale overwrites (fixes critical bug #6)
    sql = """
    UPDATE cards
    SET metadata = jsonb_set(
      jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{enrichmentStage}', $2::jsonb
      ),
      '{processing}', 'true'::jsonb
    )
    WHERE id = $1
    """

    case Repo.query(sql, [card_id, Jason.encode!(stage)]) do
      {:ok, _} -> :ok
      {:error, err} -> {:error, "Failed to set stage: #{inspect(err)}"}
    end
  end

  defp maybe_scrape(%{"content" => content}) when is_binary(content) and content != "" do
    {:ok, content}
  end

  defp maybe_scrape(%{"url" => url}) when is_binary(url) and url != "" do
    Scraper.scrape(url)
  end

  defp maybe_scrape(_card), do: {:ok, nil}

  # Map snake_case DB columns to the keys the classifier expects
  defp normalize_card(card) do
    card
    |> Map.put("imageUrl", card["image_url"])
  end

  defp write_enriched(card_id, classification) do
    now = DateTime.utc_now() |> DateTime.to_iso8601()
    summary_text = classification.summary || ""

    sql = """
    UPDATE cards
    SET
      tags = $2::text[],
      type = $3,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'processing', false,
        'enrichmentStage', 'complete',
        'enrichedAt', $4::text,
        'summary', $5::text,
        'tagsSource', 'glm',
        'enrichmentSource', 'elixir'
      )
    WHERE id = $1
    """

    case Repo.query(sql, [card_id, classification.tags, classification.type, now, summary_text]) do
      {:ok, _} ->
        # Notify RedwoodJS frontend via Postgres NOTIFY
        Repo.query("NOTIFY card_enriched, '#{card_id}'", [])
        :ok

      {:error, err} ->
        {:error, "Failed to write enriched data: #{inspect(err)}"}
    end
  end

  defp apply_fallback(card_id, reason) do
    error_msg = if is_binary(reason), do: reason, else: inspect(reason)
    now = DateTime.utc_now() |> DateTime.to_iso8601()

    sql = """
    UPDATE cards
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'processing', false,
      'enrichmentStage', 'failed',
      'enrichmentError', $2::text,
      'enrichmentFailedAt', $3::text
    )
    WHERE id = $1
    """

    case Repo.query(sql, [card_id, error_msg, now]) do
      {:ok, _} ->
        Logger.info("[Worker] Fallback applied for card #{card_id}")

      {:error, err} ->
        Logger.error("[Worker] CRITICAL: Failed to apply fallback for card #{card_id}: #{inspect(err)}")
    end
  end
end
