defmodule MymindEnrichment.Pipeline.ColorExtractor do
  @moduledoc """
  Extracts dominant colors from card images using K-means clustering.
  Categorizes palettes as warm/cool/monochrome/vibrant/muted.

  Color science inspired by dcal's ColorSpaces module.
  """
  require Logger

  @num_clusters 5
  @max_iterations 10
  @sample_size 500
  @timeout_ms 10_000

  defmodule Color do
    @moduledoc false
    defstruct [:r, :g, :b, :hex, :hsl, :weight]
  end

  @doc """
  Extract dominant colors from a card's image URL.
  Returns {:ok, %{palette: [...], category: "warm"}} or {:error, reason}.
  """
  def extract(image_url) when is_binary(image_url) and image_url != "" do
    with {:ok, pixels} <- fetch_and_decode_image(image_url),
         {:ok, clusters} <- kmeans(pixels, @num_clusters, @max_iterations) do
      palette =
        clusters
        |> Enum.sort_by(fn {_center, count} -> count end, :desc)
        |> Enum.map(fn {[r, g, b], count} ->
          hex = rgb_to_hex(r, g, b)
          {h, s, l} = rgb_to_hsl(r, g, b)
          %{hex: hex, hsl: %{h: h, s: s, l: l}, weight: count}
        end)

      total = Enum.sum(Enum.map(palette, & &1.weight))
      palette = Enum.map(palette, fn c -> %{c | weight: Float.round(c.weight / max(total, 1), 3)} end)

      category = categorize_palette(palette)

      {:ok, %{palette: palette, category: category}}
    end
  end

  def extract(_), do: {:ok, nil}

  @doc "Write color palette to card metadata."
  def extract_and_store(card_id, image_url) do
    case extract(image_url) do
      {:ok, nil} ->
        {:ok, nil}

      {:ok, %{palette: palette, category: category}} ->
        palette_json = Jason.encode!(palette)
        sql = """
        UPDATE cards
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'colorPalette', $2::jsonb,
          'colorCategory', $3::text
        )
        WHERE id = $1
        """
        MymindEnrichment.Repo.query(sql, [card_id, palette_json, category])
        {:ok, %{palette: palette, category: category}}

      {:error, reason} ->
        Logger.warning("[ColorExtractor] Failed for card: #{reason}")
        {:ok, nil}
    end
  end

  # --- Image fetching ---

  defp fetch_and_decode_image(url) do
    request = Finch.build(:get, url, [
      {"User-Agent", "Mozilla/5.0 (compatible; MymindBot/1.0)"},
      {"Accept", "image/*"}
    ])

    case Finch.request(request, MymindEnrichment.Finch, receive_timeout: @timeout_ms) do
      {:ok, %Finch.Response{status: status, body: body}} when status in 200..299 ->
        sample_pixels_from_raw(body)

      {:ok, %Finch.Response{status: status}} ->
        {:error, "Image fetch HTTP #{status}"}

      {:error, reason} ->
        {:error, "Image fetch failed: #{inspect(reason)}"}
    end
  end

  # Simple pixel sampling from raw image bytes
  # For JPEG/PNG we can't decode natively in Elixir without a NIF,
  # so we sample from raw bytes as approximate RGB values
  defp sample_pixels_from_raw(data) when byte_size(data) < 100 do
    {:error, "Image too small"}
  end

  defp sample_pixels_from_raw(data) do
    size = byte_size(data)
    # Skip headers (first ~100 bytes) and sample triplets
    start = min(100, div(size, 4))
    usable = size - start
    step = max(3, div(usable, @sample_size * 3))

    pixels =
      for offset <- start..(size - 3)//step, reduce: [] do
        acc ->
          <<_::binary-size(offset), r::8, g::8, b::8, _::binary>> = data
          # Filter out very dark or very bright pixels (likely background/artifacts)
          if r + g + b > 30 and r + g + b < 720 do
            [[r, g, b] | acc]
          else
            acc
          end
      end

    if length(pixels) < 10 do
      {:error, "Not enough valid pixels sampled"}
    else
      {:ok, Enum.take(pixels, @sample_size)}
    end
  end

  # --- K-means clustering ---

  defp kmeans(pixels, k, max_iter) do
    # Initialize centroids by taking evenly spaced samples
    n = length(pixels)
    step = max(1, div(n, k))
    initial_centers = pixels |> Enum.take_every(step) |> Enum.take(k)

    result = do_kmeans(pixels, initial_centers, max_iter, 0)
    {:ok, result}
  end

  defp do_kmeans(pixels, centers, max_iter, iter) when iter >= max_iter do
    # Return centers with their cluster sizes
    assignments = assign_pixels(pixels, centers)
    Enum.zip(centers, Enum.map(assignments, &length/1))
  end

  defp do_kmeans(pixels, centers, max_iter, iter) do
    assignments = assign_pixels(pixels, centers)

    new_centers =
      Enum.zip(centers, assignments)
      |> Enum.map(fn {center, cluster} ->
        if cluster == [] do
          center
        else
          n = length(cluster)
          [
            div(Enum.sum(Enum.map(cluster, fn [r, _, _] -> r end)), n),
            div(Enum.sum(Enum.map(cluster, fn [_, g, _] -> g end)), n),
            div(Enum.sum(Enum.map(cluster, fn [_, _, b] -> b end)), n)
          ]
        end
      end)

    if new_centers == centers do
      # Converged
      Enum.zip(new_centers, Enum.map(assignments, &length/1))
    else
      do_kmeans(pixels, new_centers, max_iter, iter + 1)
    end
  end

  defp assign_pixels(pixels, centers) do
    k = length(centers)
    empty = List.duplicate([], k)

    Enum.reduce(pixels, empty, fn pixel, clusters ->
      idx = nearest_center(pixel, centers)
      List.update_at(clusters, idx, &[pixel | &1])
    end)
  end

  defp nearest_center([r, g, b], centers) do
    centers
    |> Enum.with_index()
    |> Enum.min_by(fn {[cr, cg, cb], _} ->
      (r - cr) * (r - cr) + (g - cg) * (g - cg) + (b - cb) * (b - cb)
    end)
    |> elem(1)
  end

  # --- Color space conversions ---

  defp rgb_to_hex(r, g, b) do
    rh = r |> Integer.to_string(16) |> String.pad_leading(2, "0")
    gh = g |> Integer.to_string(16) |> String.pad_leading(2, "0")
    bh = b |> Integer.to_string(16) |> String.pad_leading(2, "0")
    "##{rh}#{gh}#{bh}"
  end

  defp rgb_to_hsl(r, g, b) do
    rf = r / 255.0
    gf = g / 255.0
    bf = b / 255.0

    max_c = max(rf, max(gf, bf))
    min_c = min(rf, min(gf, bf))
    delta = max_c - min_c

    l = (max_c + min_c) / 2.0

    {h, s} =
      if delta == 0.0 do
        {0.0, 0.0}
      else
        s = if l < 0.5, do: delta / (max_c + min_c), else: delta / (2.0 - max_c - min_c)

        h =
          cond do
            max_c == rf -> rem_float((gf - bf) / delta, 6.0)
            max_c == gf -> (bf - rf) / delta + 2.0
            true -> (rf - gf) / delta + 4.0
          end

        h = h * 60.0
        h = if h < 0, do: h + 360.0, else: h
        {h, s}
      end

    {Float.round(h, 1), Float.round(s, 3), Float.round(l, 3)}
  end

  defp rem_float(a, b) when b != 0.0 do
    a - Float.floor(a / b) * b
  end

  # --- Palette categorization ---

  defp categorize_palette(palette) do
    # Use the top 3 colors for categorization
    top3 = Enum.take(palette, 3)
    hues = Enum.map(top3, fn %{hsl: %{h: h}} -> h end)
    sats = Enum.map(top3, fn %{hsl: %{s: s}} -> s end)
    lights = Enum.map(top3, fn %{hsl: %{l: l}} -> l end)

    avg_sat = if sats == [], do: 0, else: Enum.sum(sats) / length(sats)
    avg_light = if lights == [], do: 0, else: Enum.sum(lights) / length(lights)

    cond do
      # Monochrome: low saturation across all dominant colors
      avg_sat < 0.15 -> "monochrome"

      # Vibrant: high saturation
      avg_sat > 0.6 -> "vibrant"

      # Warm: dominant hues in red/orange/yellow range (0-60 or 300-360)
      Enum.all?(hues, fn h -> h < 60 or h > 300 end) -> "warm"

      # Cool: dominant hues in blue/green range (150-270)
      Enum.all?(hues, fn h -> h > 150 and h < 270 end) -> "cool"

      # Muted: moderate saturation, mid lightness
      avg_sat < 0.4 and avg_light > 0.3 and avg_light < 0.7 -> "muted"

      # Default
      true -> "mixed"
    end
  end
end
