@echo off
REM ============================================================
REM  DINAMYT LOCAL - Iniciar el servidor (NO necesita internet)
REM  Abre dos ventanas: backend (5000) y frontend (3000).
REM ============================================================
setlocal
cd /d "%~dp0"

REM Mostrar la IP de este PC para que conectes los dispositivos
echo.
echo ============================================================
echo  Direcciones de este PC (usa una de estas en los celulares):
echo ============================================================
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo    http://%%a:3000
echo ============================================================
echo.

start "DINAMYT Backend"  cmd /k "cd /d %~dp0backend && set FLASK_ENV=development && venv\Scripts\python.exe run.py"
start "DINAMYT Frontend" cmd /k "cd /d %~dp0frontend && npm run start"

echo Se abrieron dos ventanas (Backend y Frontend).
echo Para APAGAR el sistema, cierra esas dos ventanas.
echo.
pause
exit /b 0
