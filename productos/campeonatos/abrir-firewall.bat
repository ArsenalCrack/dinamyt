@echo off
REM ============================================================
REM  DINAMYT LOCAL - Abrir el Firewall de Windows para los puertos
REM  3000 (frontend) y 5000 (backend).
REM  >>> CLIC DERECHO -> "Ejecutar como administrador" <<<
REM  Se corre UNA sola vez. Sin esto, los celulares no conectan.
REM ============================================================
netsh advfirewall firewall add rule name="DINAMYT Frontend 3000" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="DINAMYT Backend 5000"  dir=in action=allow protocol=TCP localport=5000
echo.
echo Reglas de firewall creadas para los puertos 3000 y 5000.
pause
