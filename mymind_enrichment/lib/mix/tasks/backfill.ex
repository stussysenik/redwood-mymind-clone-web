defmodule Mix.Tasks.Backfill do
  @moduledoc """
  Backfill unenriched cards through the enrichment pipeline.

  Finds all cards with no tagsSource in metadata and feeds them
  through the GLM classifier with quality gate.

  ## Usage

      DATABASE_URL=... ZHIPU_API_KEY=... mix backfill
      DATABASE_URL=... ZHIPU_API_KEY=... mix backfill --limit 50
      DATABASE_URL=... ZHIPU_API_KEY=... mix backfill --dry-run
  """
  use Mix.Task

  require Logger

  @shortdoc "Backfill unenriched cards through the enrichment pipeline"

  @impl Mix.Task
  def run(args) do
    {opts, _, _} = OptionParser.parse(args, strict: [limit: :integer, dry_run: :boolean, fix_bad: :boolean])
    limit = Keyword.get(opts, :limit, 100)
    dry_run = Keyword.get(opts, :dry_run, false)
    fix_bad = Keyword.get(opts, :fix_bad, false)

    # Start the application (boots Repo, Finch, etc.)
    Mix.Task.run("app.start")

    Logger.info("[Backfill] Starting backfill (limit: #{limit}, dry_run: #{dry_run}, fix_bad: #{fix_bad})")

    # Find cards that need enrichment
    sql = if fix_bad do
      # Target cards with stale/bad tags: fallback source, generic tags, or stopword tags
      """
      SELECT id, url, title, content, image_url, tags, metadata, type
      FROM cards
      WHERE deleted_at IS NULL
        AND (metadata->>'processing')::text IS DISTINCT FROM 'true'
        AND (
          metadata->>'tagsSource' = 'fallback'
          OR metadata->>'tagsSource' IS NULL
          OR tags @> '{"editorial"}'
          OR tags @> '{"design"}'
          OR tags @> '{"technology"}'
          OR tags @> '{"ai"}'
          OR tags @> '{"this"}'
          OR tags @> '{"that"}'
          OR tags @> '{"blame"}'
          OR tags @> '{"knew"}'
          OR tags @> '{"website"}'
          OR tags @> '{"link"}'
          OR (array_length(tags, 1) IS NULL OR array_length(tags, 1) = 0)
        )
      ORDER BY created_at DESC
      LIMIT $1
      """
    else
      """
      SELECT id, url, title, content, image_url, tags, metadata, type
      FROM cards
      WHERE (metadata->>'tagsSource') IS NULL
        AND (metadata->>'processing')::text IS DISTINCT FROM 'true'
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $1
      """
    end

    case MymindEnrichment.Repo.query_maps(sql, [limit]) do
      {:ok, cards} ->
        total = length(cards)
        Logger.info("[Backfill] Found #{total} unenriched cards")

        if dry_run do
          IO.puts("\n=== DRY RUN — would enrich #{total} cards ===")
          for card <- Enum.take(cards, 10) do
            id = format_uuid(card["id"])
            IO.puts("  #{id} | #{String.slice(card["url"] || card["title"] || "no-url", 0, 60)}")
          end
          if total > 10, do: IO.puts("  ... and #{total - 10} more")
        else
          IO.puts("\n=== Backfilling #{total} cards ===\n")
          results = backfill_cards(cards)
          print_results(results)
        end

      {:error, err} ->
        Logger.error("[Backfill] Failed to fetch cards: #{inspect(err)}")
    end
  end

  defp backfill_cards(cards) do
    total = length(cards)

    cards
    |> Enum.with_index(1)
    |> Enum.map(fn {card, idx} ->
      card_id = card["id"]
      url = card["url"] || card["title"] || "unknown"
      IO.write("[#{idx}/#{total}] #{String.slice(url, 0, 50)}... ")
      IO.write("")  # flush

      started = System.monotonic_time(:millisecond)

      result =
        try do
          # Normalize for classifier
          normalized = Map.put(card, "imageUrl", card["image_url"])
          content = card["content"]

          # Scrape if needed
          content =
            if (content == nil or content == "") and card["url"] do
              case MymindEnrichment.Pipeline.Scraper.scrape(card["url"]) do
                {:ok, scraped} -> scraped
                {:error, _} -> nil
              end
            else
              content
            end

          # Classify (always returns {:ok, ...} — handles errors internally)
          {:ok, classification} = MymindEnrichment.Pipeline.Classifier.classify(normalized, content)

          # Quality gate
          case MymindEnrichment.Pipeline.QualityGate.validate(card_id, classification) do
            {:ok, validated} ->
              write_enriched(card_id, validated)
              duration = System.monotonic_time(:millisecond) - started
              IO.puts("OK (#{duration}ms) tags=#{inspect(validated.tags)}")
              {:ok, card_id, duration}

            {:error, reason} ->
              write_fallback(card_id, "Quality gate: #{reason}")
              duration = System.monotonic_time(:millisecond) - started
              IO.puts("FALLBACK (#{duration}ms) #{reason}")
              {:fallback, card_id, duration}
          end
        rescue
          e ->
            duration = System.monotonic_time(:millisecond) - started
            IO.puts("CRASH (#{duration}ms) #{Exception.message(e)}")
            {:crash, card_id, Exception.message(e)}
        end

      # Rate limit: 1 request per second to avoid hitting GLM API limits
      Process.sleep(1_000)
      result
    end)
  end

  defp write_enriched(card_id, classification) do
    now = DateTime.utc_now() |> DateTime.to_iso8601()
    summary_text = classification.summary || ""
    tags_source = classification.source || "unknown"

    sql = """
    UPDATE cards
    SET
      tags = $2::text[],
      type = COALESCE($3, type),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'processing', false,
        'enrichmentStage', 'complete',
        'enrichedAt', $4::text,
        'summary', $5::text,
        'tagsSource', $6::text,
        'enrichmentSource', 'elixir-backfill'
      )
    WHERE id = $1
    """

    MymindEnrichment.Repo.query(sql, [card_id, classification.tags, classification.type, now, summary_text, tags_source])
  end

  defp write_fallback(card_id, reason) do
    now = DateTime.utc_now() |> DateTime.to_iso8601()
    error_msg = if is_binary(reason), do: reason, else: inspect(reason)

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

    MymindEnrichment.Repo.query(sql, [card_id, error_msg, now])
  end

  defp format_uuid(<<a::binary-4, b::binary-2, c::binary-2, d::binary-2, e::binary-6>>) do
    [a, b, c, d, e]
    |> Enum.map(&Base.encode16(&1, case: :lower))
    |> Enum.join("-")
  end

  defp format_uuid(other) when is_binary(other), do: other
  defp format_uuid(_), do: "unknown"

  defp print_results(results) do
    ok = Enum.count(results, fn r -> match?({:ok, _, _}, r) end)
    fallback = Enum.count(results, fn r -> match?({:fallback, _, _}, r) end)
    errors = Enum.count(results, fn r -> match?({:error, _, _}, r) or match?({:crash, _, _}, r) end)
    total = length(results)

    avg_ms =
      results
      |> Enum.filter(fn r -> match?({:ok, _, _}, r) or match?({:fallback, _, _}, r) end)
      |> Enum.map(fn {_, _, ms} -> ms end)
      |> then(fn
        [] -> 0
        durations -> Enum.sum(durations) / length(durations) |> round()
      end)

    IO.puts("\n=== BACKFILL RESULTS ===")
    IO.puts("Total:    #{total}")
    IO.puts("Success:  #{ok} (#{if total > 0, do: Float.round(ok * 100 / total, 1), else: 0}%)")
    IO.puts("Fallback: #{fallback}")
    IO.puts("Errors:   #{errors}")
    IO.puts("Avg time: #{avg_ms}ms per card")
  end
end
