@echo off
setlocal enableextensions
chcp 65001 >nul

REM ======================================================================
REM  CONTROL M · IMPRESION DIRECTA DE ETIQUETAS (por cable, sin preguntar)
REM  m de materia
REM ----------------------------------------------------------------------
REM  Abre Control M en una ventana de aplicacion en modo "kiosk-printing":
REM  al pulsar Imprimir, la etiqueta sale SOLA por la impresora (la D520
REM  conectada por USB), sin ningun dialogo de "imprimir".
REM ======================================================================

REM ===== CONFIGURA ESTAS DOS LINEAS (una sola vez) ======================
REM  1) La URL de Control M (la misma con la que entrais a la web).
set "CONTROLM_URL=https://controlm-mdemateria.onrender.com"
REM  2) El nombre EXACTO de la impresora de etiquetas tal y como aparece en
REM     Windows (Configuracion -> Bluetooth y dispositivos -> Impresoras).
REM     Dejalo vacio ("") para no cambiar la impresora predeterminada.
set "IMPRESORA=Phomemo D520"
REM ======================================================================

echo.
echo   Control M - Impresion directa de etiquetas
echo   -------------------------------------------
echo   Abriendo %CONTROLM_URL%
echo.

REM --- Deja la impresora de etiquetas como PREDETERMINADA (si se indico) ---
if not "%IMPRESORA%"=="" (
  echo   Fijando "%IMPRESORA%" como impresora predeterminada...
  rundll32 printui.dll,PrintUIEntry /y /n "%IMPRESORA%" 2>nul
)

REM --- Busca Google Chrome en las rutas habituales ------------------------
set "NAV="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do if exist %%P set "NAV=%%~P"

REM --- Si no hay Chrome, usa Microsoft Edge (tambien vale) ----------------
if "%NAV%"=="" for %%P in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do if exist %%P set "NAV=%%~P"

if "%NAV%"=="" (
  echo.
  echo   [X] No se encontro Google Chrome ni Microsoft Edge.
  echo       Instala Chrome ^(https://www.google.com/chrome^) y vuelve a
  echo       ejecutar este acceso directo.
  echo.
  pause
  exit /b 1
)

echo   Navegador: %NAV%
echo   Listo. Pulsa Imprimir en Control M y la etiqueta saldra sola.
echo.

REM --- Abre Control M como "app" en modo kiosk-printing -------------------
REM  --kiosk-printing        -> imprime directo, sin dialogo
REM  --app=URL               -> ventana limpia, estilo aplicacion
REM  --user-data-dir         -> perfil propio (no toca tu navegacion normal)
start "" "%NAV%" --app=%CONTROLM_URL% --kiosk-printing --user-data-dir="%LocalAppData%\ControlM-Impresora" --no-first-run --no-default-browser-check

endlocal
exit /b 0
