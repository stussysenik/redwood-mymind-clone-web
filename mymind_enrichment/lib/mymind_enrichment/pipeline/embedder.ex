defmodule MymindEnrichment.Pipeline.Embedder do
  @moduledoc """
  Generates text embeddings via the Gemini API and writes them
  to the pgvector column in the cards table.
  """
  require Logger

  @model "gemini-embedding-2"
  @dimension 1536
  @timeout_ms 15_000
  @max_text_chars 12_000

  @doc """
  Generate an embedding for the card's content and write it to the DB.
  Returns {:ok, vector} or {:error, reason}.
  """
  def embed_and_store(card_id, content, title) do
    text = build_text(content, title)

    if text == "" do
      Logger.info("[Embedder] No text to embed for card")
      {:ok, nil}
    else
      case generate_embedding(text) do
        {:ok, vector} ->
          case write_embedding(card_id, vector) do
            :ok -> {:ok, vector}
            {:error, reason} -> {:error, reason}
          end

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  @doc "Generate an embedding vector from text via Gemini API."
  def generate_embedding(text) do
    api_key = System.get_env("GOOGLE_API_KEY")
    model = System.get_env("GEMINI_EMBEDDING_MODEL") || @model

    unless api_key do
      {:error, "GOOGLE_API_KEY not set"}
    else
      url = "https://generativelanguage.googleapis.com/v1beta/models/#{model}:embedContent?key=#{api_key}"

      body =
        %{
          model: "models/#{model}",
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: @dimension,
          content: %{
            parts: [%{text: String.slice(text, 0, @max_text_chars)}]
          }
        }
        |> Jason.encode!()

      request =
        Finch.build(:post, url, [{"Content-Type", "application/json"}], body)

      case Finch.request(request, MymindEnrichment.Finch, receive_timeout: @timeout_ms) do
        {:ok, %Finch.Response{status: 200, body: resp_body}} ->
          parse_embedding(resp_body)

        {:ok, %Finch.Response{status: status, body: resp_body}} ->
          {:error, "Gemini embedding error #{status}: #{String.slice(resp_body, 0, 200)}"}

        {:error, reason} ->
          {:error, "Gemini embedding request failed: #{inspect(reason)}"}
      end
    end
  end

  defp parse_embedding(body) do
    case Jason.decode(body) do
      {:ok, %{"embedding" => %{"values" => values}}} when is_list(values) ->
        {:ok, values}

      {:ok, _} ->
        {:error, "Gemini response did not include embedding values"}

      {:error, err} ->
        {:error, "Failed to parse Gemini response: #{inspect(err)}"}
    end
  end

  defp write_embedding(card_id, vector) do
    # Format vector as pgvector literal: [0.1, 0.2, ...]
    vec_str = "[" <> Enum.join(vector, ",") <> "]"

    sql = """
    UPDATE cards
    SET embedding = $2::vector
    WHERE id = $1
    """

    case MymindEnrichment.Repo.query(sql, [card_id, vec_str]) do
      {:ok, _} -> :ok
      {:error, err} -> {:error, "Failed to write embedding: #{inspect(err)}"}
    end
  end

  defp build_text(content, title) do
    parts = []
    parts = if title && title != "", do: [title | parts], else: parts
    parts = if content && content != "", do: [content | parts], else: parts
    parts |> Enum.reverse() |> Enum.join("\n\n") |> String.trim()
  end
end
