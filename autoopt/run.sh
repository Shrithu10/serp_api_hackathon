#!/usr/bin/env bash
# One command: install dependencies, build the UI, start AutoOpt on http://127.0.0.1:8000
# Installing needs the network once; running never does.
set -euo pipefail
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r backend/requirements.txt
if [ ! -d frontend/dist ] || [ "${REBUILD_UI:-0}" = "1" ]; then
  (cd frontend && npm install --silent && npm run build --silent)
fi
cd backend && exec ../.venv/bin/python -m autoopt --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
