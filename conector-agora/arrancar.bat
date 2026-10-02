@echo off
REM ============================================================================
REM  Conector Agora -> Control M  -  m de materia
REM  Lanzador ROBUSTO: arranca el conector y, si se cae por lo que sea, lo
REM  vuelve a arrancar solo cada 15 s. Deja un registro en conector.log.
REM  NO HACE FALTA cerrar nunca esta ventana (puede minimizarse o correr oculta
REM  como tarea del sistema; ver instalar-servicio.bat).
REM  Uso manual: doble clic en este archivo.
REM ============================================================================
title Conector Agora - Control M (NO CERRAR)
cd /d "%~dp0"
set "LOG=%~dp0conector.log"

REM --- Localizar Node.js (PATH o rutas habituales de instalacion) -------------
set "NODE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE set "NODE=%%I"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE (
  echo [%date% %time%] ERROR: no se encuentra Node.js. Instalalo desde https://nodejs.org ^(LTS^).>> "%LOG%"
  echo.
  echo  [ERROR] No se encuentra Node.js en este PC.
  echo  Instalalo desde https://nodejs.org  (version LTS) y vuelve a abrir este archivo.
  echo.
  REM Esperamos y reintentamos por si se instala mientras tanto (no cerramos).
  REM (ping como "sleep": funciona tambien sin ventana, al correr como servicio)
  ping -n 61 127.0.0.1 >nul
  goto :eof
)

:loop
echo [%date% %time%] Arrancando el conector...>> "%LOG%"
echo ----------------------------------------------------------------------------
echo  Arrancando el conector...  %date% %time%
echo ----------------------------------------------------------------------------
REM Ejecuta el conector; su salida tambien va al log (para diagnosticar).
"%NODE%" conector.js >> "%LOG%" 2>&1
echo [%date% %time%] El conector se detuvo. Reintentando en 15 s.>> "%LOG%"
echo.
echo  El conector se ha detenido. Reintentando en 15 segundos...  (Ctrl+C para salir)
ping -n 16 127.0.0.1 >nul
goto loop
