#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# StockAsk — First-time setup script
# Works in Git Bash (Windows), macOS Terminal, or Linux shell.
# Usage:  bash scripts/setup.sh
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "╔══════════════════════════════════════╗"
echo "║       StockAsk — Setup Script        ║"
echo "╚══════════════════════════════════════╝"
echo ""

ERRORS=0

# ── 1. Check Python ──────────────────────────────────────────────
echo "▸ Checking Python …"
if command -v python3 &>/dev/null; then
    PY=python3
elif command -v python &>/dev/null; then
    PY=python
else
    echo "  ✗ Python not found. Install Python 3.11+ and try again."
    ERRORS=1
    PY=""
fi

if [[ -n "$PY" ]]; then
    PY_VER=$($PY --version 2>&1 | awk '{print $2}')
    PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
    if [[ "$PY_MAJOR" -lt 3 ]] || [[ "$PY_MAJOR" -eq 3 && "$PY_MINOR" -lt 11 ]]; then
        echo "  ✗ Python $PY_VER found — need 3.11+."
        ERRORS=1
    else
        echo "  ✓ Python $PY_VER"
    fi
fi

# ── 2. Check Node.js ─────────────────────────────────────────────
echo "▸ Checking Node.js …"
if command -v node &>/dev/null; then
    NODE_VER=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
    if [[ "$NODE_MAJOR" -lt 18 ]]; then
        echo "  ✗ Node $NODE_VER found — need 18+."
        ERRORS=1
    else
        echo "  ✓ Node $NODE_VER"
    fi
else
    echo "  ✗ Node.js not found. Install Node 18+ and try again."
    ERRORS=1
fi

# ── 3. Check ssh binary ──────────────────────────────────────────
echo "▸ Checking SSH …"
if command -v ssh &>/dev/null; then
    echo "  ✓ ssh available"
elif [[ -f "/c/Program Files/Git/usr/bin/ssh.exe" ]]; then
    echo "  ✓ ssh available (Git for Windows)"
else
    echo "  ✗ ssh not found. Install OpenSSH or Git for Windows."
    ERRORS=1
fi

if [[ "$ERRORS" -ne 0 ]]; then
    echo ""
    echo "Fix the issues above, then re-run this script."
    exit 1
fi

# ── 4. Python virtual environment ────────────────────────────────
echo ""
echo "▸ Setting up Python virtual environment …"
if [[ ! -d "backend/venv" ]]; then
    $PY -m venv backend/venv
    echo "  ✓ Created backend/venv"
else
    echo "  ✓ backend/venv already exists"
fi

# Activate venv (works in Git Bash and Unix)
if [[ -f "backend/venv/Scripts/activate" ]]; then
    source backend/venv/Scripts/activate
else
    source backend/venv/bin/activate
fi

echo "▸ Installing Python dependencies …"
pip install --quiet --upgrade pip
pip install --quiet -r backend/requirements.txt
echo "  ✓ Python dependencies installed"

# ── 5. Frontend dependencies ─────────────────────────────────────
echo ""
echo "▸ Installing frontend dependencies …"
cd frontend
npm install --silent
cd "$ROOT_DIR"
echo "  ✓ Frontend dependencies installed"

# ── 6. Environment file ──────────────────────────────────────────
echo ""
if [[ ! -f ".env" ]]; then
    cp .env.example .env
    echo "▸ Created .env from .env.example"
    echo "  ⚠  Edit .env and fill in your credentials before running the app."
else
    echo "▸ .env already exists — skipping"
fi

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════╗"
echo "║          Setup complete!             ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your SSH host, DB credentials, and PEM key path"
echo "  2. Run:  bash scripts/start.sh"
echo ""
