@echo off
rem ============================================================
rem  ODDEMON TYPOGRAPHY GENERATOR - one-click launcher (Windows)
rem  Double-click to run.
rem  ASCII-only on purpose; stored with CRLF (see .gitattributes)
rem  so that a downloaded ZIP still boots.
rem
rem  Which Python is used (first match wins):
rem    1. %%PYTHON_EXE%%   environment variable
rem    2. python.txt       one line = full path to python.exe (gitignored)
rem    3. python on PATH
rem    4. py launcher
rem
rem  If that interpreter ALREADY has gradio, app.py is run with it
rem  directly - no virtualenv, no download, nothing reinstalled.
rem  A virtualenv is only built when gradio is missing.
rem ============================================================
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo ==== ODDEMON TYPOGRAPHY GENERATOR ====
echo.

rem ---- 0. pick the interpreter ------------------------------
set "PY="
if defined PYTHON_EXE if exist "%PYTHON_EXE%" set "PY=%PYTHON_EXE%"

if not defined PY if exist "python.txt" (
  for /f "usebackq delims=" %%i in ("python.txt") do (
    if "!PY!"=="" (
      set "LINE=%%i"
      if defined LINE set "LINE=!LINE:"=!"
      if defined LINE if exist "!LINE!" set "PY=!LINE!"
    )
  )
)

if not defined PY (
  for /f "delims=" %%i in ('where python 2^>nul') do (
    if "!PY!"=="" if exist "%%i" set "PY=%%i"
  )
)
if not defined PY (
  for /f "delims=" %%i in ('where py 2^>nul') do (
    if "!PY!"=="" if exist "%%i" set "PY=%%i"
  )
)
if not defined PY goto nopy
if not exist "%PY%" goto nopy

echo [*] Python : %PY%
set "PYVER=unknown"
set "VERFILE=%TEMP%\oddemontypo_version.txt"
if exist "%VERFILE%" del "%VERFILE%" >nul 2>&1
"%PY%" -c "import sys;print(sys.version.split()[0])" >"%VERFILE%" 2>nul
if exist "%VERFILE%" set /p PYVER=<"%VERFILE%"
if exist "%VERFILE%" del "%VERFILE%" >nul 2>&1
echo [*] Version: %PYVER%
echo.

rem ---- 1. gradio already there? then just run it -------------
"%PY%" -c "import gradio" >nul 2>&1
if not errorlevel 1 goto run

rem ---- 1b. no gradio - build a virtualenv --------------------
echo [!] gradio is not installed in this interpreter.
echo     Building .venv from it (one-time).
set "VP="
if exist ".venv\Scripts\python.exe" set "VP=.venv\Scripts\python.exe"
if not defined VP if exist ".venv\bin\python.exe" set "VP=.venv\bin\python.exe"

rem A venv is welded to the interpreter that created it (.venv\pyvenv.cfg).
rem If it was built by a different one, it is useless here - rebuild.
set "SRC="
if exist ".venv\source.txt" for /f "usebackq delims=" %%i in (".venv\source.txt") do set "SRC=%%i"
if defined VP if /i not "!SRC!"=="%PY%" (
  echo [!] .venv was built by : !SRC!
  echo [!] rebuilding it with : %PY%
  rmdir /s /q ".venv"
  set "VP="
)

if not defined VP (
  echo [1/3] Creating virtual environment .venv ...
  "%PY%" -m venv .venv
  if errorlevel 1 (
    echo [X] Could not create the virtual environment.
    pause
    exit /b 1
  )
  if exist ".venv\Scripts\python.exe" set "VP=.venv\Scripts\python.exe"
  if not defined VP if exist ".venv\bin\python.exe" set "VP=.venv\bin\python.exe"
  >".venv\source.txt" echo %PY%
) else (
  echo [1/3] Reusing existing .venv (built by the same Python).
)

if not defined VP (
  echo [X] The virtual environment has no usable python.exe.
  pause
  exit /b 1
)

echo [2/3] Installing dependencies ...
"%VP%" -m pip install --upgrade pip --disable-pip-version-check
"%VP%" -m pip install -r requirements.txt --disable-pip-version-check
if errorlevel 1 (
  echo [X] Dependency installation failed. Check your network.
  echo     Mirror example:
  echo       "%VP%" -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
  pause
  exit /b 1
)
set "RUN=%VP%"
goto start

:run
echo [1/3] gradio already present - running with it directly.
echo [2/3] No virtualenv, no installation.
set "RUN=%PY%"

:start
echo [3/3] Starting. Open http://127.0.0.1:7860 in your browser.
echo       Press Ctrl+C in this window to stop.
echo.
"%RUN%" app.py
set "RC=%ERRORLEVEL%"

echo.
echo The program has stopped (exit code %RC%).
pause
exit /b %RC%

:nopy
echo [X] Python 3.10+ was not found.
echo.
echo     Fix it in one of these ways:
echo       1. Create  python.txt  next to start.bat, one line only:
echo          E:\PPPYYYTTTHHHOOONNN3.12\python.exe
echo       2. Or run:  set PYTHON_EXE=E:\some\path\python.exe
echo.
echo     Download Python: https://www.python.org/downloads/
echo     During install, tick "Add python.exe to PATH".
echo.
pause
exit /b 1
