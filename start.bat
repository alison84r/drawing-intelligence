@echo off
setlocal enabledelayedexpansion
title Drawing Intelligence — Launcher
echo.
echo  Scanning for free ports...

:: Find a free port starting from a base, store result in named variable
:: Bases live in the 9000s to stay clear of the other app on :3000 / :8001
call :findFreePort 8022 EXTRACTOR_PORT
call :findFreePort 9173 FRONTEND_PORT

echo  Extractor port : %EXTRACTOR_PORT%
echo  Frontend  port : %FRONTEND_PORT%
echo.

:: Save ports to .ports file so stop.bat can read them
(
  echo EXTRACTOR_PORT=%EXTRACTOR_PORT%
  echo FRONTEND_PORT=%FRONTEND_PORT%
) > "%~dp0.ports"

:: Start the Postgres container (no-op if already running)
docker compose up -d db

:: Start Python extractor
start "DI Extractor :%EXTRACTOR_PORT%" /D "%~dp0packages\extractor" cmd /k "set EXTRACTOR_PORT=%EXTRACTOR_PORT%&& python run.py"

:: Give the extractor a moment to bind before Vite starts proxying
timeout /t 3 /nobreak >nul

:: Start Frontend (Vite) — port + proxy targets driven entirely by env vars
start "DI Frontend :%FRONTEND_PORT%" /D "%~dp0" cmd /k "set EXTRACTOR_PORT=%EXTRACTOR_PORT%&& set FRONTEND_PORT=%FRONTEND_PORT%&& pnpm --filter frontend dev"

echo.
echo  All services launched in separate windows.
echo.
echo  Open : http://localhost:%FRONTEND_PORT%
echo.
echo  Run stop.bat to shut everything down.
echo.
goto :eof


:findFreePort
:: Usage: call :findFreePort <startPort> <varName>
:: NOTE: use /C: literal search. findstr treats a space in the pattern as an
:: OR separator, so "/R :PORT .*LISTENING" matches EVERY listening line and
:: loops forever. The trailing space anchors the match to the local-address
:: column (":9001 " won't match ":90011"); a second findstr filters LISTENING.
set _PORT=%1
:_portLoop
netstat -ano | findstr /C:":%_PORT% " | findstr /C:"LISTENING" >nul 2>&1
if %ERRORLEVEL%==0 (
    set /a _PORT+=1
    goto _portLoop
)
set %2=%_PORT%
goto :eof
