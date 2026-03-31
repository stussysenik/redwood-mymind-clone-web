defmodule MymindEnrichmentWeb.SidecarModeTest do
  use MymindEnrichmentWeb.ConnCase, async: true

  test "GET /api/health reports background enrichment disabled by default", %{conn: conn} do
    conn = get(conn, "/api/health")

    assert %{
             "status" => "ok",
             "service" => "mymind-enrichment",
             "background_enrichment" => false
           } = json_response(conn, 200)
  end

  test "GET /api/stats stays safe in sidecar mode", %{conn: conn} do
    conn = get(conn, "/api/stats")

    assert %{
             "pipeline_stats" => [],
             "background_enrichment" => false
           } = json_response(conn, 200)
  end

  test "POST /api/enrich/:card_id is unavailable in sidecar mode", %{conn: conn} do
    conn = post(conn, "/api/enrich/test-card-id", %{})

    assert %{
             "status" => "disabled",
             "card_id" => "test-card-id"
           } = json_response(conn, 503)
  end
end
