defmodule MymindEnrichment.Repo do
  @moduledoc """
  Database connection manager.
  Uses raw Postgrex (not Ecto) since we're working with an existing
  Prisma-managed schema. Provides a supervised connection pool
  and a NOTIFY listener for new card events.
  """
  use GenServer

  require Logger

  @notification_channel "new_card"

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @doc "Execute a query against the database."
  def query(sql, params \\ []) do
    GenServer.call(__MODULE__, {:query, sql, params}, 30_000)
  end

  @doc "Execute a query and return rows as maps."
  def query_maps(sql, params \\ []) do
    case query(sql, params) do
      {:ok, %Postgrex.Result{columns: columns, rows: rows}} ->
        maps = Enum.map(rows, fn row ->
          columns
          |> Enum.zip(row)
          |> Map.new()
        end)
        {:ok, maps}

      {:error, _} = error ->
        error
    end
  end

  # GenServer callbacks

  @impl true
  def init(_) do
    database_url = System.get_env("DATABASE_URL") || raise "DATABASE_URL not set"

    uri = URI.parse(database_url)
    userinfo = String.split(uri.userinfo || "", ":")

    conn_opts = [
      hostname: uri.host,
      port: uri.port || 5432,
      username: Enum.at(userinfo, 0),
      password: Enum.at(userinfo, 1),
      database: String.trim_leading(uri.path || "/", "/"),
      ssl: [verify: :verify_none],
      pool_size: 5
    ]

    {:ok, conn} = Postgrex.start_link(conn_opts)

    # Start NOTIFY listener in a separate connection
    {:ok, listener} = Postgrex.Notifications.start_link(conn_opts)
    Postgrex.Notifications.listen!(listener, @notification_channel)

    Logger.info("[Repo] Connected to database, listening on channel '#{@notification_channel}'")

    {:ok, %{conn: conn, listener: listener}}
  end

  @impl true
  def handle_call({:query, sql, params}, _from, %{conn: conn} = state) do
    result = Postgrex.query(conn, sql, params)
    {:reply, result, state}
  end

  @impl true
  def handle_info({:notification, _pid, _ref, @notification_channel, payload}, state) do
    Logger.info("[Repo] Received NOTIFY on '#{@notification_channel}': #{payload}")

    # Forward to pipeline producer
    MymindEnrichment.Pipeline.Producer.enqueue(payload)

    {:noreply, state}
  end

  @impl true
  def handle_info(_msg, state) do
    {:noreply, state}
  end
end
