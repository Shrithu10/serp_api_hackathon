#!/usr/bin/env bash
# One command: install deps, build the UI, start PARALLAX on http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r backend/requirements.txt
(cd frontend && npm install --silent && npm run build --silent)
echo
echo "  PARALLAX → http://localhost:8000"
echo
cd backend && exec ../.venv/bin/uvicorn parallax.app:app --host 0.0.0.0 --port "${PORT:-8000}"
