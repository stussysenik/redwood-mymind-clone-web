defmodule MymindEnrichment.Pipeline.Scraper do
  @moduledoc """
  URL content scraper. Fetches page content for classification.
  Extracts OG meta tags as fallback for pages with little visible text.
  """
  require Logger

  @timeout_ms 8_000
  @max_body_bytes 500_000

  @doc "Scrape URL and return text content."
  def scrape(url) when is_binary(url) and url != "" do
    Logger.info("[Scraper] Fetching #{url}")

    request =
      Finch.build(:get, url, [
        {"User-Agent", "Mozilla/5.0 (compatible; MymindBot/1.0)"},
        {"Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
      ])

    case Finch.request(request, MymindEnrichment.Finch, receive_timeout: @timeout_ms) do
      {:ok, %Finch.Response{status: status, body: body}} when status in 200..299 ->
        content = extract_content(body)
        Logger.info("[Scraper] Got #{String.length(content)} chars from #{url}")
        {:ok, content}

      {:ok, %Finch.Response{status: status}} ->
        {:error, "HTTP #{status} for #{url}"}

      {:error, %Mint.TransportError{reason: :timeout}} ->
        {:error, "Scrape timeout after #{@timeout_ms}ms for #{url}"}

      {:error, reason} ->
        {:error, "Scrape failed: #{inspect(reason)}"}
    end
  end

  def scrape(_), do: {:ok, nil}

  # Extract content: OG meta first, then body text
  defp extract_content(html) when byte_size(html) > @max_body_bytes do
    html |> binary_part(0, @max_body_bytes) |> extract_content()
  end

  defp extract_content(html) do
    og_meta = extract_og_meta(html)
    body_text = extract_text(html)

    # If body text is too short (< 100 chars), rely more on OG meta
    if String.length(body_text) < 100 and og_meta != "" do
      "#{og_meta}\n\n#{body_text}" |> String.trim()
    else
      body_text
    end
  end

  # Extract OpenGraph and meta description tags — crucial for Instagram, Twitter, etc.
  defp extract_og_meta(html) do
    parts = []

    # og:title
    parts = case Regex.run(~r/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/, html) do
      [_, val] -> ["Title: #{val}" | parts]
      _ -> parts
    end

    # og:description
    parts = case Regex.run(~r/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/, html) do
      [_, val] -> ["Description: #{val}" | parts]
      _ ->
        # Try name="description" as fallback
        case Regex.run(~r/<meta[^>]+name="description"[^>]+content="([^"]*)"/, html) do
          [_, val] -> ["Description: #{val}" | parts]
          _ -> parts
        end
    end

    # og:site_name
    parts = case Regex.run(~r/<meta[^>]+property="og:site_name"[^>]+content="([^"]*)"/, html) do
      [_, val] -> ["Site: #{val}" | parts]
      _ -> parts
    end

    # Twitter card description
    parts = case Regex.run(~r/<meta[^>]+name="twitter:description"[^>]+content="([^"]*)"/, html) do
      [_, val] when val != "" -> ["Tweet: #{val}" | parts]
      _ -> parts
    end

    # HTML title tag
    parts = case Regex.run(~r/<title[^>]*>([^<]+)<\/title>/i, html) do
      [_, val] -> ["Page title: #{String.trim(val)}" | parts]
      _ -> parts
    end

    parts
    |> Enum.reverse()
    |> Enum.join("\n")
  end

  # Basic HTML text extraction
  defp extract_text(html) do
    html
    |> String.replace(~r/<script[\s\S]*?<\/script>/i, "")
    |> String.replace(~r/<style[\s\S]*?<\/style>/i, "")
    |> String.replace(~r/<[^>]+>/, " ")
    |> String.replace("&amp;", "&")
    |> String.replace("&lt;", "<")
    |> String.replace("&gt;", ">")
    |> String.replace("&quot;", "\"")
    |> String.replace("&#39;", "'")
    |> String.replace("&nbsp;", " ")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
    |> String.slice(0, 10_000)
  end
end
