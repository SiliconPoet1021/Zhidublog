@echo off
cd /d "%~dp0"

echo.
echo Starting Zhidu Studio...
echo Local site: http://localhost:4321
echo Writing desk: http://127.0.0.1:4322
echo.

call npx astro dev --background
call npm run studio

echo.
echo Studio stopped. Press any key to close.
pause >nul
