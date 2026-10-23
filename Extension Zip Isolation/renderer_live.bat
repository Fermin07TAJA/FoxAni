@echo off
setlocal

set PYTHON_EXE=python
set VENV_DIR=.venv
set APP_DIR=%~dp0

cd /d "%APP_DIR%"

if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo Creating virtual environment...
    %PYTHON_EXE% -m venv "%VENV_DIR%"
)

call "%VENV_DIR%\Scripts\activate.bat"

"%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip
"%VENV_DIR%\Scripts\python.exe" -m pip install flask

set HOST=127.0.0.1
set PORT=5000

echo Starting Renderer Live on http://%HOST%:%PORT% ...
"%VENV_DIR%\Scripts\python.exe" renderer_live.py

endlocal
pause
