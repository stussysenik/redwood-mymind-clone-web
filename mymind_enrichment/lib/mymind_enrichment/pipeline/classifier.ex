defmodule MymindEnrichment.Pipeline.Classifier do
  @moduledoc """
  Classifies card content via GLM-4.7 (text) or GLM-4.6v (vision).
  Constructs platform-aware prompts and parses structured JSON responses.
  """
  require Logger

  @text_model "glm-4.7"
  @vision_model "glm-4.6v"
  @default_timeout_ms 40_000
  @max_tokens 4000

  defmodule Classification do
    @moduledoc false
    defstruct [:type, :title, :tags, :summary, :platform]

    @type t :: %__MODULE__{
            type: String.t(),
            title: String.t(),
            tags: [String.t()],
            summary: String.t(),
            platform: String.t() | nil
          }
  end

  @doc """
  Classify card content using a two-strategy approach:
  1. Vision + text (if image available)
  2. Text-only fallback

  Returns {:ok, %Classification{}} or {:error, reason}
  """
  def classify(card, scraped_content) do
    content = scraped_content || card["content"] || ""
    url = card["url"] || ""
    image_url = card["imageUrl"]
    title = card["title"] || ""

    {platform, guideline} = detect_platform(url)

    # Strategy 1: Vision + content (if image available)
    result =
      if image_url && image_url != "" do
        case classify_with_vision(content, url, title, image_url, platform, guideline) do
          {:ok, classification} ->
            {:ok, classification}

          {:error, reason} ->
            Logger.warning("[Classifier] Vision strategy failed: #{reason}, trying text-only")
            classify_text_only(content, url, title, platform, guideline)
        end
      else
        classify_text_only(content, url, title, platform, guideline)
      end

    case result do
      {:ok, classification} ->
        {:ok, classification}

      {:error, reason} ->
        Logger.warning("[Classifier] All strategies failed: #{reason}, generating fallback")
        {:ok, generate_fallback(url, content, title)}
    end
  end

  # --- Strategy implementations ---

  defp classify_with_vision(content, url, title, image_url, platform, guideline) do
    system_prompt = build_system_prompt(platform, guideline)

    user_content = [
      %{type: "text", text: build_user_message(content, url, title)},
      %{type: "image_url", image_url: %{url: image_url}}
    ]

    messages = [
      %{role: "system", content: system_prompt},
      %{role: "user", content: user_content}
    ]

    call_glm(@vision_model, messages, @default_timeout_ms)
  end

  defp classify_text_only(content, url, title, platform, guideline) do
    if content == "" and url == "" do
      {:error, "No content or URL to classify"}
    else
      system_prompt = build_system_prompt(platform, guideline)

      messages = [
        %{role: "system", content: system_prompt},
        %{role: "user", content: build_user_message(content, url, title)}
      ]

      call_glm(@text_model, messages, 25_000)
    end
  end

  # --- GLM API call ---

  defp call_glm(model, messages, timeout_ms) do
    api_key = System.get_env("ZHIPU_API_KEY")
    api_base = System.get_env("ZHIPU_API_BASE") || "https://api.z.ai/api/coding/paas/v4"

    unless api_key do
      {:error, "ZHIPU_API_KEY not set"}
    else
      url = "#{api_base}/chat/completions"

      body =
        %{
          model: model,
          messages: messages,
          max_tokens: @max_tokens,
          tools: [classification_tool()],
          tool_choice: %{type: "function", function: %{name: "classify_content"}}
        }
        |> Jason.encode!()

      request =
        Finch.build(:post, url, [
          {"Content-Type", "application/json"},
          {"Authorization", "Bearer #{api_key}"}
        ], body)

      case Finch.request(request, MymindEnrichment.Finch, receive_timeout: timeout_ms) do
        {:ok, %Finch.Response{status: 200, body: resp_body}} ->
          parse_glm_response(resp_body)

        {:ok, %Finch.Response{status: status, body: resp_body}} ->
          {:error, "GLM API error #{status}: #{String.slice(resp_body, 0, 200)}"}

        {:error, %Mint.TransportError{reason: :timeout}} ->
          {:error, "GLM API timeout after #{timeout_ms}ms"}

        {:error, reason} ->
          {:error, "GLM API request failed: #{inspect(reason)}"}
      end
    end
  end

  defp parse_glm_response(body) do
    case Jason.decode(body) do
      {:ok, %{"choices" => [%{"message" => message} | _]}} ->
        parse_message(message)

      {:ok, other} ->
        {:error, "Unexpected GLM response format: #{inspect(other) |> String.slice(0, 200)}"}

      {:error, err} ->
        {:error, "Failed to parse GLM response JSON: #{inspect(err)}"}
    end
  end

  defp parse_message(%{"tool_calls" => [%{"function" => %{"arguments" => args}} | _]}) do
    parse_classification_json(args)
  end

  defp parse_message(%{"content" => content}) when is_binary(content) do
    # Try to extract JSON from content (fenced or raw)
    json_str =
      case Regex.run(~r/```(?:json)?\s*([\s\S]*?)```/, content) do
        [_, captured] -> captured
        nil ->
          case Regex.run(~r/(\{[\s\S]*\})/, content) do
            [_, captured] -> captured
            nil -> content
          end
      end

    parse_classification_json(json_str)
  end

  defp parse_message(_), do: {:error, "No usable content in GLM response"}

  defp parse_classification_json(json_str) do
    case Jason.decode(json_str) do
      {:ok, %{"type" => type, "title" => title, "tags" => tags, "summary" => summary} = data}
      when is_binary(type) and is_binary(title) and is_list(tags) and is_binary(summary) ->
        {:ok,
         %Classification{
           type: type,
           title: String.slice(title, 0, 120),
           tags: tags |> Enum.map(&String.downcase/1) |> Enum.take(8),
           summary: summary,
           platform: data["platform"]
         }}

      {:ok, _} ->
        {:error, "Classification JSON missing required fields"}

      {:error, err} ->
        {:error, "Failed to parse classification JSON: #{inspect(err)}"}
    end
  end

  # --- Prompt construction ---

  @platform_guidelines %{
    "instagram" => "Focus on visual aesthetics, design patterns, creator identity, brand names",
    "twitter" => "Focus on ideas, discourse, personality, thread themes, specific concepts",
    "x" => "Focus on ideas, discourse, personality, thread themes, specific concepts",
    "reddit" => "Focus on community, discussion topics, subreddit culture",
    "imdb" => "Focus on genre, director, cinematic qualities, themes",
    "letterboxd" => "Focus on genre, director, cinematic qualities, themes",
    "youtube" => "Focus on creator, format (tutorial/vlog/review), subject matter",
    "github" => "Focus on tech stack, programming concepts, tools, use cases",
    "medium" => "Focus on subject matter, writing style, author expertise",
    "substack" => "Focus on subject matter, writing style, author expertise"
  }

  defp detect_platform(url) when is_binary(url) and url != "" do
    host =
      case URI.parse(url) do
        %URI{host: host} when is_binary(host) -> String.downcase(host)
        _ -> ""
      end

    {platform, guideline} =
      Enum.find_value(@platform_guidelines, {"General", "Focus: core subject, key entities."}, fn {key, guide} ->
        if String.contains?(host, key), do: {String.capitalize(key), guide}
      end)

    {platform, guideline}
  end

  defp detect_platform(_), do: {"General", "Focus: core subject, key entities."}

  defp build_system_prompt(platform, guideline) do
    """
    You are a highly sophisticated curator for a visual knowledge system. Analyze content and generate metadata that enables SERENDIPITOUS discovery across disciplines.

    CRITICAL INSTRUCTIONS:
    1. SUMMARY: Write a HOLISTIC summary (3-8 sentences). Consider the entire text/image. Do not focus only on the intro. If it's a code snippet, describe what it does.

    2. TAGGING: Generate 3-5 HIERARCHICAL tags optimized for #{platform} content:

       PLATFORM GUIDELINE: #{guideline}

       TAG STRUCTURE (3-5 tags total):
       - SPECIFIC IDENTIFIERS (1-2): Named entities, brands, tools, people, places
         Examples: "bmw-m3", "terence-tao", "rapier", "village-pm", "paris"

       - BROADER CATEGORIES (1-2): Subject domains, fields of study, concepts
         Examples: "automotive", "mathematics", "physics-engine", "luxury-streetwear"

       - VISUAL STYLE (1 - MANDATORY): A tangible descriptor of what this content LOOKS like.
         Pick the ONE term someone would type to find this content again.
         Examples: "dark-mode", "film-grain", "whitespace-heavy", "retro", "studio-lit"

       QUALITY RULES:
       - All lowercase, use hyphens for multi-word tags
       - NEVER return more than one tag from the same semantic category
       - Tags must be specific enough to distinguish this item from 90% of other items
       - BAD tags: "design", "graphicdesign", "branding" (too generic, redundant)
       - GOOD tags: "swiss-poster-design", "slab-serif-logotype", "earthy-brand-palette"
       - DO NOT use generic tags like "website", "link", "page", "content"
       - DO NOT include the platform name as a tag

    3. PLATFORMS: Detect platforms like Are.na, Pinterest, Mastodon, Bluesky, GitHub, Instagram, Twitter/X.
    4. PRODUCTS: If the item is clearly a product, classify type as "product".

    RESPONSE FORMAT: Return ONLY a JSON object (no markdown, no explanation):
    {"type": "article|image|note|product|book|video|audio|social|movie", "title": "concise title", "tags": ["tag1", "tag2", "tag3", "tag4"], "summary": "holistic summary", "platform": "source platform"}
    """
  end

  defp build_user_message(content, url, title) do
    parts = []
    parts = if title != "", do: ["Title: #{title}" | parts], else: parts
    parts = if url != "", do: ["URL: #{url}" | parts], else: parts

    parts =
      if content != "" do
        truncated = String.slice(content, 0, 8000)
        ["Content:\n#{truncated}" | parts]
      else
        parts
      end

    parts |> Enum.reverse() |> Enum.join("\n\n")
  end

  defp classification_tool do
    %{
      type: "function",
      function: %{
        name: "classify_content",
        description:
          "Classify web content into a category with exactly 3-5 hierarchical tags and a holistic summary.",
        parameters: %{
          type: "object",
          properties: %{
            type: %{
              type: "string",
              enum: ["article", "image", "note", "product", "book", "video", "audio", "social", "movie"],
              description: "The primary content type."
            },
            title: %{
              type: "string",
              description: "A concise, descriptive title (max 60 chars)"
            },
            tags: %{
              type: "array",
              items: %{type: "string"},
              minItems: 3,
              maxItems: 5,
              description:
                "3-5 HIERARCHICAL tags: 1-2 PRIMARY (essence), 1-2 CONTEXTUAL (subject), 1 VISUAL STYLE (tangible)"
            },
            summary: %{
              type: "string",
              description: "Holistic summary (3-8 sentences). Capture the full context."
            },
            platform: %{
              type: "string",
              description: "The source platform or website name."
            }
          },
          required: ["type", "title", "tags", "summary"]
        }
      }
    }
  end

  # --- Fallback tag generation ---

  defp generate_fallback(url, content, title) do
    tags = extract_keywords(content, url, title)

    type =
      cond do
        String.contains?(url || "", ["youtube.com", "vimeo.com"]) -> "video"
        String.contains?(url || "", ["instagram.com"]) -> "image"
        String.contains?(url || "", ["twitter.com", "x.com"]) -> "social"
        true -> "article"
      end

    %Classification{
      type: type,
      title: title || "Untitled",
      tags: tags,
      summary: String.slice(content || "", 0, 200),
      platform: nil
    }
  end

  defp extract_keywords(content, url, title) do
    text = "#{title} #{content}" |> String.downcase()

    # Simple keyword extraction from content
    words =
      text
      |> String.replace(~r/[^a-z0-9\s-]/, "")
      |> String.split(~r/\s+/)
      |> Enum.filter(&(String.length(&1) > 3))
      |> Enum.frequencies()
      |> Enum.sort_by(fn {_, count} -> count end, :desc)
      |> Enum.take(3)
      |> Enum.map(fn {word, _} -> word end)

    # Add domain-based tag
    domain_tag =
      case URI.parse(url || "") do
        %URI{host: host} when is_binary(host) ->
          host
          |> String.replace(~r/^www\./, "")
          |> String.split(".")
          |> hd()

        _ ->
          nil
      end

    tags = if domain_tag && domain_tag not in words, do: [domain_tag | words], else: words
    tags = Enum.take(tags, 4) ++ ["editorial"]
    Enum.uniq(tags) |> Enum.take(5)
  end
end
