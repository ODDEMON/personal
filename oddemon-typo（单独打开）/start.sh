#!/usr/bin/env bash
# ============================================================
#  ODDEMON TYPOGRAPHY GENERATOR - one-click launcher (macOS / Linux)
#  Usage:  chmod +x start.sh && ./start.sh
#
#  Which Python gets used, in priority order:
#    1. $PYTHON_EXE   environment variable
#    2. python.txt    one line = full path to the python binary (gitignored)
#    3. python3 / python on PATH
# ============================================================
set -e
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==== ODDEMON TYPOGRAPHY GENERATOR ===="
echo

# ---- 0. pick the interpreter --------------------------------
PY=""
if [ -n "$PYTHON_EXE" ] && [ -x "$PYTHON_EXE" ]; then
  PY="$PYTHON_EXE"
elif [ -f python.txt ]; then
  # strip CR in case the file was written on Windows
  cand="$(tr -d '\r' < python.txt | head -n 1)"
  [ -x "$cand" ] && PY="$cand"
fi
if [ -z "$PY" ]; then
  for c in python3 python; do
    if command -v "$c" >/dev/null 2>&1; then PY="$(command -v "$c")"; break; fi
  done
fi
if [ -z "$PY" ]; then
  echo "[X] Python 3.10+ was not found."
  echo "    Fix: put the full path in python.txt, or:  export PYTHON_EXE=/path/to/python3"
  echo "    macOS:  brew install python@3.13"
  echo "    Ubuntu: sudo apt install python3 python3-venv"
  exit 1
fi

echo "[*] Python : $PY"
echo "[*] Version: $("$PY" -c 'import sys;print(sys.version.split()[0])')"
echo

# ---- 1. gradio already there? then just run it --------------
if "$PY" -c "import gradio" >/dev/null 2>&1; then
  echo "[1/3] gradio already present - running with it directly."
  echo "[2/3] No virtualenv, no installation."
  echo "[3/3] Starting. Open http://127.0.0.1:7860 in your browser."
  echo "      Press Ctrl+C in this window to stop."
  echo
  exec "$PY" app.py
fi

# ---- 1b. no gradio - build a virtualenv ---------------------
echo "[!] gradio is not installed in this interpreter."
echo "    Building .venv from it (one-time)."
# A venv is welded to the interpreter that created it (.venv/pyvenv.cfg).
# If it was built by a different one, it is useless here - rebuild.
VP=""
[ -x ".venv/bin/python" ] && VP=".venv/bin/python"
[ -z "$VP" ] && [ -x ".venv/Scripts/python.exe" ] && VP=".venv/Scripts/python.exe"

SRC=""
[ -f ".venv/source.txt" ] && SRC="$(tr -d '\r' < .venv/source.txt | head -n 1)"
if [ -n "$VP" ] && [ "$SRC" != "$PY" ]; then
  echo "[!] .venv was built by : ${SRC:-<unknown>}"
  echo "[!] rebuilding it with : $PY"
  rm -rf .venv
  VP=""
fi

if [ -z "$VP" ]; then
  echo "[1/3] Creating virtual environment .venv ..."
  "$PY" -m venv .venv
  [ -x ".venv/bin/python" ] && VP=".venv/bin/python"
  [ -z "$VP" ] && [ -x ".venv/Scripts/python.exe" ] && VP=".venv/Scripts/python.exe"
  printf '%s\n' "$PY" > .venv/source.txt
else
  echo "[1/3] Virtual environment .venv already matches this Python."
fi

if [ -z "$VP" ]; then
  echo "[X] The virtual environment has no usable python."
  exit 1
fi

# ---- 2. dependencies ----------------------------------------
echo "[2/3] Installing dependencies ..."
"$VP" -m pip install --upgrade pip --disable-pip-version-check
"$VP" -m pip install -r requirements.txt --disable-pip-version-check

# ---- 3. run --------------------------------------------------
echo "[3/3] Starting. Open http://127.0.0.1:7860 in your browser."
echo "      Press Ctrl+C in this window to stop."
echo
"$VP" app.py
