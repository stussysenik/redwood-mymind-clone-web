defmodule MymindEnrichment.Pipeline.QualityGate do
  @moduledoc """
  Validates classification quality and rejects/re-prompts if tags
  are redundant, generic, or missing aesthetic coverage.

  This is the key fix for the "too many fallback tags" problem.
  The gate ensures every card gets meaningful, non-redundant tags.
  """
  require Logger

  alias MymindEnrichment.Pipeline.Classifier.Classification

  @blocked_tags MapSet.new([
    "website", "link", "saved", "explore", "social", "page", "content",
    "post", "share", "online", "web", "internet", "digital", "media",
    "news", "update", "info", "information", "resource", "tool",
    "twitter", "instagram", "reddit", "youtube", "github", "medium",
    "substack", "linkedin", "facebook", "tiktok", "pinterest",
    "mastodon", "bluesky", "threads", "x"
  ])

  # Common English stopwords that should never be tags
  @stopwords MapSet.new([
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
    "her", "was", "one", "our", "out", "has", "have", "been", "from",
    "that", "this", "with", "they", "will", "each", "make", "like",
    "just", "over", "such", "take", "than", "them", "very", "some",
    "could", "would", "about", "which", "come", "more", "also", "back",
    "after", "into", "most", "only", "other", "then", "what", "when",
    "your", "best", "know", "want", "here", "much", "every", "good",
    "well", "items", "rules", "voice", "head", "been", "contact",
    "slideshow", "twin", "company", "offices", "bottled", "finally",
    "gallery", "cant"
  ])

  @aesthetic_vocabulary MapSet.new([
    # Tone
    "dark-mode", "light-mode", "high-contrast", "muted", "monochrome", "neon", "pastel", "saturated",
    # Texture
    "film-grain", "glossy", "matte", "textured", "flat", "3d", "hand-drawn", "pixel-art",
    # Layout
    "grid-layout", "whitespace-heavy", "dense", "full-bleed", "card-based", "asymmetric", "single-column", "split-screen",
    # Typography
    "serif", "sans-serif", "monospace", "display-type", "hand-lettered", "brutalist-type",
    # Photo style
    "portrait", "aerial", "macro", "street-photo", "studio-lit", "natural-light", "bokeh", "long-exposure",
    # Design era
    "brutalist", "retro", "y2k", "swiss", "art-deco", "vaporwave", "skeuomorphic",
    # Mood
    "cozy", "clinical", "editorial", "playful", "corporate", "indie", "luxe", "raw",
    # Motion
    "animated", "interactive", "parallax", "scroll-driven", "static"
  ])

  @default_aesthetic %{
    "article" => "editorial",
    "image" => "studio-lit",
    "social" => "raw",
    "video" => "cinematic",
    "product" => "glossy",
    "note" => "raw",
    "movie" => "cinematic",
    "book" => "editorial",
    "audio" => "matte"
  }

  # Pairs of tags that are near-synonyms and should be deduplicated
  @synonym_groups [
    ~w(design graphicdesign graphic-design),
    ~w(branding brand brand-identity),
    ~w(typography type typographic lettering),
    ~w(photography photo photograph),
    ~w(illustration illustrating illustrated),
    ~w(architecture architectural),
    ~w(fashion style styling),
    ~w(music musical audio),
    ~w(film cinema cinematic movie),
    ~w(tech technology technological),
    ~w(art artistic artwork),
    ~w(code coding programming developer),
    ~w(ui ux ui-design ux-design user-interface),
    ~w(web website webpage web-design),
    ~w(mobile app application)
  ]

  @doc """
  Validate a classification result. Returns {:ok, cleaned_classification}
  or {:error, reason} if the result is unsalvageable.

  Fixes applied:
  1. Remove blocked tags
  2. Deduplicate near-synonyms (keep the most specific one)
  3. Ensure aesthetic tag presence
  4. Cap at 5 tags with aesthetic guaranteed
  """
  def validate(card_id, %Classification{} = classification) do
    tags = classification.tags

    # Step 1: Remove blocked tags and stopwords
    cleaned = Enum.reject(tags, fn t ->
      lower = String.downcase(t)
      MapSet.member?(@blocked_tags, lower) or MapSet.member?(@stopwords, lower)
    end)

    if cleaned == [] do
      id_str = if is_binary(card_id) and byte_size(card_id) == 16, do: Base.encode16(card_id, case: :lower), else: "#{card_id}"
      Logger.warning("[QualityGate] Card #{id_str}: ALL tags were blocked: #{inspect(tags)}")
      {:error, "All tags are generic/blocked"}
    else
      # Step 2: Deduplicate near-synonyms
      deduped = dedup_synonyms(cleaned)

      # Step 3: Ensure aesthetic tag
      with_aesthetic = ensure_aesthetic(deduped, classification.type)

      # Step 4: Cap at 5, keeping aesthetic
      final = cap_tags(with_aesthetic, 5)

      id_str = if is_binary(card_id) and byte_size(card_id) == 16, do: Base.encode16(card_id, case: :lower), else: "#{card_id}"
      removed = max(0, length(tags) - length(final))
      added = max(0, length(final) - length(cleaned))
      Logger.info(
        "[QualityGate] Card #{id_str}: #{inspect(final)} " <>
          "(#{removed} removed, #{added} added, #{length(final)} final)"
      )

      {:ok, %{classification | tags: final}}
    end
  end

  # --- Synonym deduplication ---

  defp dedup_synonyms(tags) do
    lowered = Enum.map(tags, &String.downcase/1)

    # For each synonym group, keep only the most specific (longest) tag
    Enum.reduce(@synonym_groups, lowered, fn group, acc ->
      matching = Enum.filter(acc, &(&1 in group))

      case matching do
        [] -> acc
        [_single] -> acc
        multiples ->
          # Keep the longest (most specific) tag
          keeper = Enum.max_by(multiples, &String.length/1)
          Enum.reject(acc, &(&1 in multiples and &1 != keeper))
      end
    end)
  end

  # --- Aesthetic enforcement ---

  defp ensure_aesthetic(tags, content_type) do
    has_aesthetic = Enum.any?(tags, &MapSet.member?(@aesthetic_vocabulary, &1))

    if has_aesthetic do
      tags
    else
      fallback = Map.get(@default_aesthetic, content_type, "editorial")
      tags ++ [fallback]
    end
  end

  # --- Tag capping ---

  defp cap_tags(tags, max) when length(tags) <= max, do: tags

  defp cap_tags(tags, max) do
    # Find the aesthetic tag index
    aesthetic_idx = Enum.find_index(tags, &MapSet.member?(@aesthetic_vocabulary, &1))

    if aesthetic_idx do
      aesthetic = Enum.at(tags, aesthetic_idx)
      non_aesthetic = List.delete_at(tags, aesthetic_idx) |> Enum.take(max - 1)
      non_aesthetic ++ [aesthetic]
    else
      Enum.take(tags, max)
    end
  end
end
