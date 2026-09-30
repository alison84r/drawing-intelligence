@echo off
title Drawing Intelligence — Stop
echo.
echo  Stopping Drawing Intelligence services...

:: Read ports saved by start.bat (these defaults match start.bat's 9000s bases)
set EXTRACTOR_PORT=9000
set FRONTEND_PORT=9173

if exist "%~dp0.ports" (
    for /f "tokens=1,2 delims==" %%A in (%~dp0.ports) do (
        set %%A=%%B
    )
    del "%~dp0.ports" >nul 2>&1
)

echo  Releasing ports %EXTRACTOR_PORT%, %FRONTEND_PORT%...

:: Use /C: literal search. A space in a findstr pattern is an OR separator, so
:: "/R :PORT .*LISTENING" would match EVERY listening line and we'd kill every
:: listening PID on the machine (including unrelated apps). The trailing space
:: anchors to the local-address column; a second findstr filters LISTENING.
for %%P in (%EXTRACTOR_PORT% %FRONTEND_PORT%) do (
    for /f "tokens=5" %%i in ('netstat -ano ^| findstr /C:":%%P " ^| findstr /C:"LISTENING"') do (
        echo  Killing PID %%i on port %%P
        taskkill /PID %%i /F >nul 2>&1
    )
)

:: Close the named console windows
for %%W in (
    "DI Extractor :%EXTRACTOR_PORT%"
    "DI Frontend :%FRONTEND_PORT%"
) do (
    taskkill /FI "WINDOWTITLE eq %%~W" /F >nul 2>&1
)

echo  Done.
echo.
