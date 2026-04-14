@echo off
title Drawing Intelligence — Stop
echo.
echo  Stopping Drawing Intelligence services...

:: Read ports saved by start.bat
set BACKEND_PORT=3001
set EXTRACTOR_PORT=8000
set FRONTEND_PORT=5173

if exist "%~dp0.ports" (
    for /f "tokens=1,2 delims==" %%A in (%~dp0.ports) do (
        set %%A=%%B
    )
    del "%~dp0.ports" >nul 2>&1
)

echo  Releasing ports %BACKEND_PORT%, %EXTRACTOR_PORT%, %FRONTEND_PORT%...

for %%P in (%BACKEND_PORT% %EXTRACTOR_PORT% %FRONTEND_PORT%) do (
    for /f "tokens=5" %%i in ('netstat -ano ^| findstr /R ":%%P .*LISTENING"') do (
        echo  Killing PID %%i on port %%P
        taskkill /PID %%i /F >nul 2>&1
    )
)

:: Close the named console windows
for %%W in (
    "DI Backend :%BACKEND_PORT%"
    "DI Extractor :%EXTRACTOR_PORT%"
    "DI Frontend :%FRONTEND_PORT%"
) do (
    taskkill /FI "WINDOWTITLE eq %%~W" /F >nul 2>&1
)

echo  Done.
echo.
