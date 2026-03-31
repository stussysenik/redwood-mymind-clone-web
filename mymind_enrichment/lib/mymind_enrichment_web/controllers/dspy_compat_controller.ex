defmodule MymindEnrichmentWeb.DspyCompatController do
  use MymindEnrichmentWeb, :controller

  alias MymindEnrichment.Pipeline.Classifier
  alias MymindEnrichment.Pipeline.Classifier.Classification
  alias MymindEnrichment.Pipeline.QualityGate

  @aesthetic_tags MapSet.new([
                    "dark-mode",
                    "light-mode",
                    "high-contrast",
                    "muted",
                    "monochrome",
                    "neon",
                    "pastel",
                    "saturated",
                    "film-grain",
                    "glossy",
                    "matte",
                    "textured",
                    "flat",
                    "3d",
                    "hand-drawn",
                    "pixel-art",
                    "grid-layout",
                    "whitespace-heavy",
                    "dense",
                    "full-bleed",
                    "card-based",
                    "asymmetric",
                    "single-column",
                    "split-screen",
                    "serif",
                    "sans-serif",
                    "monospace",
                    "display-type",
                    "hand-lettered",
                    "brutalist-type",
                    "portrait",
                    "aerial",
                    "macro",
                    "street-photo",
                    "studio-lit",
                    "natural-light",
                    "bokeh",
                    "long-exposure",
                    "brutalist",
                    "retro",
                    "y2k",
                    "swiss",
                    "art-deco",
                    "vaporwave",
                    "skeuomorphic",
                    "cozy",
                    "clinical",
                    "editorial",
                    "playful",
                    "corporate",
                    "indie",
                    "luxe",
                    "raw",
                    "animated",
                    "interactive",
                    "parallax",
                    "scroll-driven",
                    "static"
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

  def health(conn, _params) do
    json(conn, %{status: "ok", service: "mymind-enrichment", compatibility: "dspy"})
  end

  def extract_title(conn, params) do
    raw_content = clean_text(params["raw_content"])
    author = clean_text(params["author"])
    platform = clean_platform(params["platform"])

    classification =
      classify_request(%{
        content: strip_author_prefix(raw_content, author),
        title: nil,
        platform: platform
      })

    title =
      classification.title
      |> clean_text()
      |> fallback_title(raw_content)

    json(conn, %{
      title: title,
      is_valid: title != "",
      issues: if(classification.source == "fallback", do: ["fallback"], else: []),
      confidence: confidence_for(classification.source, :title)
    })
  end

  def generate_summary(conn, params) do
    content = clean_text(params["content"])
    title = clean_text(params["title"])
    author = clean_text(params["author"])
    platform = clean_platform(params["platform"])

    classification =
      classify_request(%{
        content: join_non_empty([title, author, content], "\n\n"),
        title: title,
        platform: platform
      })

    json(conn, %{
      summary: classification.summary,
      key_topics: Enum.take(classification.tags, 3),
      content_type: classification.type,
      quality_score: confidence_for(classification.source, :summary),
      is_analytical: classification.source != "fallback"
    })
  end

  def generate_tags(conn, params) do
    content = clean_text(params["content"])
    title = clean_text(params["title"])
    platform = clean_platform(params["platform"])
    image_url = clean_text(params["image_url"])

    classification =
      classify_request(%{
        content: content,
        title: title,
        platform: platform,
        image_url: image_url
      })

    {primary, contextual, vibe} = structure_tags(classification.tags)

    json(conn, %{
      tags: %{
        primary: primary,
        contextual: contextual,
        vibe: vibe
      },
      confidence: confidence_for(classification.source, :tags),
      reasoning: "source=#{classification.source}"
    })
  end

  defp classify_request(
         %{
           content: content,
           title: title,
           platform: platform
         } = request
       ) do
    card = %{
      "content" => content,
      "title" => title,
      "url" => synthetic_url(platform),
      "imageUrl" => Map.get(request, :image_url)
    }

    {:ok, classification} = Classifier.classify(card, content)

    case QualityGate.validate("dspy-compat", classification) do
      {:ok, validated} -> validated
      {:error, _reason} -> ensure_semantic_tags(classification)
    end
  end

  defp ensure_semantic_tags(%Classification{} = classification) do
    tags =
      classification.tags
      |> Enum.map(&clean_text/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.reject(&MapSet.member?(@aesthetic_tags, &1))
      |> Enum.take(4)

    aesthetic = Map.get(@default_aesthetic, classification.type, "editorial")

    %{classification | tags: Enum.take(tags ++ [aesthetic], 5)}
  end

  defp structure_tags(tags) do
    cleaned =
      tags
      |> Enum.map(&clean_text/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    {aesthetic, non_aesthetic} =
      case Enum.split_with(cleaned, &MapSet.member?(@aesthetic_tags, &1)) do
        {[first | _], rest} -> {first, rest}
        {[], rest} -> {List.last(rest), Enum.drop(rest, -1)}
      end

    ordered =
      non_aesthetic
      |> Enum.reject(&is_nil/1)

    primary = Enum.take(ordered, 2)
    contextual = ordered |> Enum.drop(length(primary)) |> Enum.take(2)
    vibe = aesthetic || ""

    {primary, contextual, vibe}
  end

  defp strip_author_prefix(content, ""), do: content

  defp strip_author_prefix(content, author) do
    author_variants =
      [
        author,
        String.downcase(author),
        String.replace(author, "@", ""),
        "@#{String.replace(author, "@", "")}"
      ]
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()

    Enum.reduce_while(author_variants, content, fn variant, current ->
      if String.starts_with?(String.downcase(current), String.downcase(variant)) do
        trimmed =
          current
          |> String.slice(String.length(variant)..-1//1)
          |> clean_text()
          |> String.replace(~r/^[\s\-:·]+/u, "")

        {:halt, trimmed}
      else
        {:cont, current}
      end
    end)
  end

  defp fallback_title("", raw_content) do
    raw_content
    |> clean_text()
    |> String.slice(0, 80)
  end

  defp fallback_title(title, _raw_content), do: title

  defp synthetic_url(platform), do: "https://#{platform}.local"

  defp clean_platform(platform) do
    case clean_text(platform) do
      "" -> "general"
      value -> value
    end
  end

  defp clean_text(nil), do: ""
  defp clean_text(text) when is_binary(text), do: String.trim(text)
  defp clean_text(text), do: text |> to_string() |> String.trim()

  defp join_non_empty(parts, separator) do
    parts
    |> Enum.map(&clean_text/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.join(separator)
  end

  defp confidence_for("fallback", :title), do: 0.45
  defp confidence_for("fallback", :summary), do: 0.35
  defp confidence_for("fallback", :tags), do: 0.4
  defp confidence_for("glm", :title), do: 0.78
  defp confidence_for("glm", :summary), do: 0.86
  defp confidence_for("glm", :tags), do: 0.82
  defp confidence_for("kimi", :title), do: 0.88
  defp confidence_for("kimi", :summary), do: 0.92
  defp confidence_for("kimi", :tags), do: 0.9
  defp confidence_for(_source, :title), do: 0.7
  defp confidence_for(_source, :summary), do: 0.75
  defp confidence_for(_source, :tags), do: 0.75
end
