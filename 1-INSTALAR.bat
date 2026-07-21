@echo off
REM ============================================================
REM  DINAMYT LOCAL - Instalacion (se corre UNA sola vez, CON internet)
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo === [1/3] Creando entorno de Python del backend ===
cd backend
python -m venv venv
call venv\Scripts\python.exe -m pip install --upgrade pip
call venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto error
cd ..

echo.
echo === [2/3] Instalando dependencias del frontend ===
cd frontend
call npm install
if errorlevel 1 goto error

echo.
echo === [3/3] Compilando el frontend (build de produccion) ===
call npm run build
if errorlevel 1 goto error
cd ..

echo.
echo ============================================================
echo  LISTO. Ya puedes usar 2-INICIAR.bat (sin internet).
echo ============================================================
pause
exit /b 0

:error
echo.
echo *** Hubo un error en la instalacion. Revisa el mensaje de arriba. ***
pause
exit /b 1
