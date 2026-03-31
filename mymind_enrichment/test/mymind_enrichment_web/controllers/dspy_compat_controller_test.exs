defmodule MymindEnrichmentWeb.DspyCompatControllerTest do
  use MymindEnrichmentWeb.ConnCase, async: true

  test "GET /health exposes DSPy compatibility", %{conn: conn} do
    conn = get(conn, "/health")

    assert %{
             "status" => "ok",
             "service" => "mymind-enrichment",
             "compatibility" => "dspy"
           } = json_response(conn, 200)
  end

  test "POST /extract/title returns a DSPy-compatible title payload", %{conn: conn} do
    conn =
      post(conn, "/extract/title", %{
        "raw_content" => "@burberry Burberry Circus campaign visuals",
        "author" => "@burberry",
        "platform" => "instagram"
      })

    assert %{
             "title" => title,
             "is_valid" => true,
             "issues" => issues,
             "confidence" => confidence
           } = json_response(conn, 200)

    assert is_binary(title)
    assert title != ""
    assert is_list(issues)
    assert is_number(confidence)
  end

  test "POST /generate/summary returns analytical summary structure", %{conn: conn} do
    conn =
      post(conn, "/generate/summary", %{
        "content" =>
          "Example Domain is the canonical placeholder page used in technical documentation and testing examples.",
        "title" => "Example Domain",
        "platform" => "wikipedia"
      })

    assert %{
             "summary" => summary,
             "key_topics" => key_topics,
             "content_type" => content_type,
             "quality_score" => quality_score,
             "is_analytical" => is_analytical
           } = json_response(conn, 200)

    assert is_binary(summary)
    assert summary != ""
    assert is_list(key_topics)
    assert is_binary(content_type)
    assert is_number(quality_score)
    assert is_boolean(is_analytical)
  end

  test "POST /generate/tags returns hierarchical tag buckets", %{conn: conn} do
    conn =
      post(conn, "/generate/tags", %{
        "content" =>
          "A clean documentation page explaining why Example Domain is reserved for technical examples and educational material.",
        "title" => "Example Domain",
        "platform" => "website"
      })

    assert %{
             "tags" => %{
               "primary" => primary,
               "contextual" => contextual,
               "vibe" => vibe
             },
             "confidence" => confidence,
             "reasoning" => reasoning
           } = json_response(conn, 200)

    assert is_list(primary)
    assert is_list(contextual)
    assert is_binary(vibe)
    assert is_number(confidence)
    assert is_binary(reasoning)
    assert primary != [] or contextual != [] or vibe != ""
  end
end
