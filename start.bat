@echo off
setlocal enabledelayedexpansion
title Drawing Intelligence — Launcher
echo.
echo  Scanning for free ports...

:: Find a free port starting from a base, store result in named variable
call :findFreePort 3001 BACKEND_PORT
call :findFreePort 8000 EXTRACTOR_PORT
call :findFreePort 5173 FRONTEND_PORT

echo  Backend   port : %BACKEND_PORT%
echo  Extractor port : %EXTRACTOR_PORT%
echo  Frontend  port : %FRONTEND_PORT%
echo.

:: Save ports to .ports file so stop.bat can read them
(
  echo BACKEND_PORT=%BACKEND_PORT%
  echo EXTRACTOR_PORT=%EXTRACTOR_PORT%
  echo FRONTEND_PORT=%FRONTEND_PORT%
) > "%~dp0.ports"

:: Start Backend (Node/Express)
start "DI Backend :%BACKEND_PORT%" cmd /k "cd /d "%~dp0" && set PORT=%BACKEND_PORT% && pnpm --filter backend dev"

:: Start Python extractor
start "DI Extractor :%EXTRACTOR_PORT%" cmd /k "cd /d "%~dp0packages\extractor" && set EXTRACTOR_PORT=%EXTRACTOR_PORT% && python run.py"

:: Give backend + extractor a moment to bind before Vite starts proxying
timeout /t 3 /nobreak >nul

:: Start Frontend (Vite) — passes both port env vars so proxy targets are correct
start "DI Frontend :%FRONTEND_PORT%" cmd /k "cd /d "%~dp0" && set BACKEND_PORT=%BACKEND_PORT% && set EXTRACTOR_PORT=%EXTRACTOR_PORT% && pnpm --filter frontend dev -- --port %FRONTEND_PORT%"

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
set _PORT=%1
:_portLoop
netstat -ano | findstr /R ":%_PORT% .*LISTENING" >nul 2>&1
if %ERRORLEVEL%==0 (
    set /a _PORT+=1
    goto _portLoop
)
set %2=%_PORT%
goto :eof
