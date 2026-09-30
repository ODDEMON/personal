#!/usr/bin/env bash
# ============================================================
#  ODDEMON TYPOGRAPHY GENERATOR - one-click launcher (macOS / Linux)
#  Usage:  chmod +x start.sh && ./start.sh
# ============================================================
set -e
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==== ODDEMON TYPOGRAPHY GENERATOR ===="
echo

# ---- 1. locate python ---------------------------------------
PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "[X] Python 3.10+ was not found."
  echo "    macOS:  brew install python@3.13"
  echo "    Ubuntu: sudo apt install python3 python3-venv"
  exit 1
fi

# ---- 2. virtual environment ---------------------------------
if [ ! -x ".venv/bin/python" ]; then
  echo "[1/3] Creating virtual environment .venv ..."
  "$PY" -m venv .venv
else
  echo "[1/3] Virtual environment .venv already exists, reusing it."
fi

# ---- 3. dependencies ----------------------------------------
echo "[2/3] Installing dependencies ..."
.venv/bin/python -m pip install --upgrade pip --disable-pip-version-check
.venv/bin/python -m pip install -r requirements.txt --disable-pip-version-check

# ---- 4. run --------------------------------------------------
echo "[3/3] Starting. Open http://127.0.0.1:7860 in your browser."
echo "      Press Ctrl+C in this window to stop."
echo
.venv/bin/python app.py
