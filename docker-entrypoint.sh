#!/bin/sh
# Railway sets PORT env var. RedwoodJS needs --webPort and --apiPort.
WEB_PORT="${PORT:-8910}"
API_PORT="8911"

echo "Starting RedwoodJS on web:$WEB_PORT api:$API_PORT"
exec yarn rw serve --webPort "$WEB_PORT" --apiPort "$API_PORT" --webHost 0.0.0.0 --apiHost 0.0.0.0
