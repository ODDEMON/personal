@echo off
rem ============================================================
rem  ODDEMON TYPOGRAPHY GENERATOR - one-click launcher (Windows)
rem  Usage: double-click this file. Nothing else to install.
rem  This file is intentionally ASCII-only so that non-ASCII
rem  install paths cannot corrupt it.
rem ============================================================
setlocal
cd /d "%~dp0"

echo ==== ODDEMON TYPOGRAPHY GENERATOR ====
echo.

rem ---- 1. locate python -------------------------------------
python --version >nul 2>&1
if errorlevel 1 goto trypy
set PY=python
goto foundpy

:trypy
py -3 --version >nul 2>&1
if errorlevel 1 goto nopy
set PY=py -3
goto foundpy

:nopy
echo [X] Python 3.10+ was not found on this machine.
echo     Download: https://www.python.org/downloads/
echo     During install, tick "Add python.exe to PATH".
echo.
pause
exit /b 1

:foundpy

rem ---- 2. virtual environment -------------------------------
if not exist ".venv\Scripts\python.exe" (
  echo [1/3] Creating virtual environment .venv ...
  %PY% -m venv .venv
  if errorlevel 1 (
    echo [X] Failed to create the virtual environment.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Virtual environment .venv already exists, reusing it.
)

rem ---- 3. dependencies --------------------------------------
echo [2/3] Installing dependencies ...
".venv\Scripts\python.exe" -m pip install --upgrade pip --disable-pip-version-check
".venv\Scripts\python.exe" -m pip install -r requirements.txt --disable-pip-version-check
if errorlevel 1 (
  echo [X] Dependency installation failed. Check your network connection.
  pause
  exit /b 1
)

rem ---- 4. run -----------------------------------------------
echo [3/3] Starting. Open http://127.0.0.1:7860 in your browser.
echo       Press Ctrl+C in this window to stop.
echo.
".venv\Scripts\python.exe" app.py

echo.
echo The program has stopped.
pause
