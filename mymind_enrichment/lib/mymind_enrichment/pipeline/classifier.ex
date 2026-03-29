defmodule MymindEnrichment.Pipeline.Classifier do
  @moduledoc """
  Classifies card content using a multi-model strategy:
  1. Kimi K2.5 via NVIDIA NIM (primary — fast, reliable, free tier)
  2. GLM-4.7 text-only (fallback if Kimi fails)
  3. Title/platform-based tags (last resort)

  All models use OpenAI-compatible chat completions API.
  """
  require Logger

  # Primary: Kimi K2.5 via NVIDIA NIM (free, reliable, 10-20s responses)
  @kimi_model "moonshotai/kimi-k2.5"
  @kimi_api_base "https://integrate.api.nvidia.com/v1"
  @kimi_timeout_ms 90_000

  # Fallback: GLM-4.7 via Zhipu (paid, 25% timeout rate)
  @glm_text_model "glm-4.7"
  @glm_vision_model "glm-4.6v"
  @glm_timeout_ms 40_000

  # Kimi K2.5 is a thinking model — needs extra tokens for reasoning + response
  @max_tokens 8000

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
  Classify card content using multi-model strategy.
  Returns {:ok, %Classification{}} — always succeeds (fallback guaranteed).
  """
  def classify(card, scraped_content) do
    content = scraped_content || card["content"] || ""
    url = card["url"] || ""
    image_url = card["imageUrl"]
    title = card["title"] || ""

    {platform, guideline} = detect_platform(url)
    system_prompt = build_system_prompt(platform, guideline)
    user_message = build_user_message(content, url, title)

    # Strategy chain: Kimi K2.5 → GLM vision → GLM text → fallback
    result = try_kimi(system_prompt, user_message)

    result =
      case result do
        {:ok, _} -> result
        {:error, kimi_reason} ->
          Logger.warning("[Classifier] Kimi K2.5 failed: #{kimi_reason}, trying GLM")
          try_glm(system_prompt, user_message, image_url)
      end

    case result do
      {:ok, classification} ->
        {:ok, classification}

      {:error, reason} ->
        Logger.warning("[Classifier] All strategies failed: #{reason}, generating fallback")
        {:ok, generate_fallback(url, content, title)}
    end
  end

  # --- Kimi K2.5 via NVIDIA NIM ---

  defp try_kimi(system_prompt, user_message) do
    api_key = System.get_env("NIM_API_KEY")

    unless api_key do
      {:error, "NIM_API_KEY not set"}
    else
      call_openai_compatible(
        @kimi_api_base,
        api_key,
        @kimi_model,
        [
          %{role: "system", content: system_prompt},
          %{role: "user", content: user_message}
        ],
        @kimi_timeout_ms
      )
    end
  end

  # --- GLM fallback (vision then text) ---

  defp try_glm(system_prompt, user_message, image_url) do
    # Try vision first if image available
    result =
      if image_url && image_url != "" do
        case try_glm_vision(system_prompt, user_message, image_url) do
          {:ok, _} = ok -> ok
          {:error, reason} ->
            Logger.warning("[Classifier] GLM vision failed: #{reason}, trying text-only")
            try_glm_text(system_prompt, user_message)
        end
      else
        try_glm_text(system_prompt, user_message)
      end

    # Retry once on timeout
    case result do
      {:error, "GLM API timeout" <> _ = reason} ->
        Logger.warning("[Classifier] GLM text timed out, retrying: #{reason}")
        try_glm_text(system_prompt, user_message)
      other -> other
    end
  end

  defp try_glm_vision(system_prompt, user_message, image_url) do
    api_key = System.get_env("ZHIPU_API_KEY")
    api_base = System.get_env("ZHIPU_API_BASE") || "https://api.z.ai/api/coding/paas/v4"

    unless api_key do
      {:error, "ZHIPU_API_KEY not set"}
    else
      user_content = [
        %{type: "text", text: user_message},
        %{type: "image_url", image_url: %{url: image_url}}
      ]

      call_glm(
        api_base, api_key, @glm_vision_model,
        [
          %{role: "system", content: system_prompt},
          %{role: "user", content: user_content}
        ],
        @glm_timeout_ms
      )
    end
  end

  defp try_glm_text(system_prompt, user_message) do
    api_key = System.get_env("ZHIPU_API_KEY")
    api_base = System.get_env("ZHIPU_API_BASE") || "https://api.z.ai/api/coding/paas/v4"

    unless api_key do
      {:error, "ZHIPU_API_KEY not set"}
    else
      call_glm(
        api_base, api_key, @glm_text_model,
        [
          %{role: "system", content: system_prompt},
          %{role: "user", content: user_message}
        ],
        30_000
      )
    end
  end

  # --- API calls ---

  # OpenAI-compatible API (Kimi K2.5 via NIM)
  defp call_openai_compatible(api_base, api_key, model, messages, timeout_ms) do
    url = "#{api_base}/chat/completions"

    body =
      %{
        model: model,
        messages: messages,
        max_tokens: @max_tokens,
        temperature: 0.3
      }
      |> Jason.encode!()

    request =
      Finch.build(:post, url, [
        {"Content-Type", "application/json"},
        {"Authorization", "Bearer #{api_key}"}
      ], body)

    case Finch.request(request, MymindEnrichment.Finch, receive_timeout: timeout_ms) do
      {:ok, %Finch.Response{status: 200, body: resp_body}} ->
        parse_openai_response(resp_body)

      {:ok, %Finch.Response{status: status, body: resp_body}} ->
        {:error, "NIM API error #{status}: #{String.slice(resp_body, 0, 200)}"}

      {:error, %Mint.TransportError{reason: :timeout}} ->
        {:error, "NIM API timeout after #{timeout_ms}ms"}

      {:error, reason} ->
        {:error, "NIM API request failed: #{inspect(reason)}"}
    end
  end

  # GLM API call (with tool_choice for structured output)
  defp call_glm(api_base, api_key, model, messages, timeout_ms) do
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

  # --- Response parsing ---

  # Parse OpenAI-compatible response (NIM/Kimi — returns JSON in content)
  defp parse_openai_response(body) do
    case Jason.decode(body) do
      {:ok, %{"choices" => [%{"message" => %{"content" => content}} | _]}} when is_binary(content) ->
        parse_json_from_content(content)

      {:ok, %{"choices" => [%{"message" => message} | _]}} ->
        parse_message(message)

      {:ok, _} ->
        {:error, "Unexpected NIM response format"}

      {:error, err} ->
        {:error, "Failed to parse NIM response: #{inspect(err)}"}
    end
  end

  # Parse GLM response (may use tool_calls or content)
  defp parse_glm_response(body) do
    case Jason.decode(body) do
      {:ok, %{"choices" => [%{"message" => message} | _]}} ->
        parse_message(message)

      {:ok, _} ->
        {:error, "Unexpected GLM response format"}

      {:error, err} ->
        {:error, "Failed to parse GLM response: #{inspect(err)}"}
    end
  end

  defp parse_message(%{"tool_calls" => [%{"function" => %{"arguments" => args}} | _]}) do
    parse_classification_json(args)
  end

  defp parse_message(%{"content" => content}) when is_binary(content) do
    parse_json_from_content(content)
  end

  defp parse_message(_), do: {:error, "No usable content in response"}

  defp parse_json_from_content(content) do
    # Extract JSON from content (may be fenced or raw)
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
    title_tags =
      (title || "")
      |> String.downcase()
      |> String.replace(~r/[^a-z0-9\s-]/, "")
      |> String.split(~r/\s+/)
      |> Enum.filter(&(String.length(&1) > 3))
      |> Enum.reject(&(&1 in ~w(this that with from have been will what your they their about just more than some also like into very)))
      |> Enum.take(3)

    domain_tag =
      case URI.parse(url || "") do
        %URI{host: host} when is_binary(host) ->
          host |> String.replace(~r/^www\./, "") |> String.split(".") |> hd()
        _ -> nil
      end

    platform_tag =
      cond do
        String.contains?(url || "", "instagram.com") -> "instagram"
        String.contains?(url || "", ["twitter.com", "x.com"]) -> "tweet"
        String.contains?(url || "", "youtube.com") -> "youtube"
        String.contains?(url || "", "reddit.com") -> "reddit"
        true -> nil
      end

    tags =
      [platform_tag, domain_tag | title_tags]
      |> Enum.reject(&is_nil/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()
      |> Enum.take(5)

    if tags == [], do: ["saved"], else: tags
  end
end
