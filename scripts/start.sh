#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# StockAsk — Start backend + frontend
# Works in Git Bash (Windows), macOS Terminal, or Linux shell.
# Usage:  bash scripts/start.sh
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# ── Load .env ─────────────────────────────────────────────────────
if [[ ! -f ".env" ]]; then
    echo "✗ .env not found. Run 'bash scripts/setup.sh' first."
    exit 1
fi

# Read SSH_LOCAL_PORT from .env (default 5435)
SSH_LOCAL_PORT=$(grep -E '^SSH_LOCAL_PORT=' .env | cut -d= -f2 | tr -d '[:space:]')
SSH_LOCAL_PORT=${SSH_LOCAL_PORT:-5435}

# ── Activate venv ─────────────────────────────────────────────────
if [[ -f "backend/venv/Scripts/activate" ]]; then
    source backend/venv/Scripts/activate
elif [[ -f "backend/venv/bin/activate" ]]; then
    source backend/venv/bin/activate
else
    echo "✗ Virtual environment not found. Run 'bash scripts/setup.sh' first."
    exit 1
fi

# ── Check if SSH tunnel is needed ─────────────────────────────────
echo "▸ Checking SSH tunnel on port $SSH_LOCAL_PORT …"

TUNNEL_UP=false
if command -v ss &>/dev/null; then
    ss -tln | grep -q ":${SSH_LOCAL_PORT} " && TUNNEL_UP=true
elif command -v netstat &>/dev/null; then
    netstat -an | grep -q "LISTENING.*:${SSH_LOCAL_PORT}" && TUNNEL_UP=true
    netstat -an | grep -q ":${SSH_LOCAL_PORT}.*LISTEN" && TUNNEL_UP=true
fi

if $TUNNEL_UP; then
    echo "  ✓ Port $SSH_LOCAL_PORT already listening (tunnel or PgAdmin)"
else
    echo "  ⚠  Port $SSH_LOCAL_PORT is not open."
    echo "     Start an SSH tunnel manually before the backend can connect:"
    echo ""
    echo "     ssh -o StrictHostKeyChecking=no -i <KEY_PATH> -L ${SSH_LOCAL_PORT}:localhost:5432 ubuntu@<EC2_IP> -N &"
    echo ""
fi

# ── Cleanup on exit ──────────────────────────────────────────────
BACKEND_PID=""

cleanup() {
    echo ""
    echo "▸ Shutting down …"
    if [[ -n "$BACKEND_PID" ]]; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
        echo "  ✓ Backend stopped"
    fi
    echo "  ✓ Done"
}
trap cleanup EXIT INT TERM

# ── Start backend ────────────────────────────────────────────────
echo ""
echo "▸ Starting backend (uvicorn) on :8000 …"
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --log-level warning &
BACKEND_PID=$!
sleep 2

if kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "  ✓ Backend running (PID $BACKEND_PID)"
else
    echo "  ✗ Backend failed to start. Check logs above."
    exit 1
fi

# ── Start frontend (foreground) ──────────────────────────────────
echo "▸ Starting frontend (Vite) on :5173 …"
echo ""
cd frontend
npm run dev
