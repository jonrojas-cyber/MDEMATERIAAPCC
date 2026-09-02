@echo off
REM ============================================================================
REM  Conector Agora -> Control M  ·  m de materia
REM  Lanzador robusto: arranca el conector y, si se cae, lo vuelve a arrancar
REM  solo cada 30 s. NO CERRAR esta ventana (puede minimizarse).
REM  Uso: doble clic en este archivo.
REM ============================================================================
title Conector Agora - Control M (NO CERRAR)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] No se encuentra Node.js en este PC.
  echo  Instalalo desde https://nodejs.org  (version LTS) y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

:loop
echo ----------------------------------------------------------------------------
echo  Arrancando el conector...  %date% %time%
echo ----------------------------------------------------------------------------
node conector.js
echo.
echo  El conector se ha detenido. Reintentando en 30 segundos...  (Ctrl+C para salir)
timeout /t 30 /nobreak >nul
goto loop
