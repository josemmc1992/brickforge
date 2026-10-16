@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Instala Node.js 22.22 o posterior y vuelve a ejecutar este archivo. & pause & exit /b 1)
if not exist node_modules (call npm ci || exit /b 1)
if not exist dist-server\http.mjs (call npm run build || exit /b 1)
echo Abre http://localhost:3100 en tu navegador. Cierra con Ctrl+C.
call npm start
pause
