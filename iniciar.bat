@echo off
echo Iniciando PGD...

start "PGD Backend" cmd /k "cd /d %~dp0backend && npm install && npm run start:dev"
timeout /t 5 /nobreak >nul
start "PGD Frontend" cmd /k "cd /d %~dp0frontend && npm install && npm run dev"

timeout /t 8 /nobreak >nul
start http://localhost:5173
