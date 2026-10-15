@echo off
setlocal enableextensions
chcp 65001 >nul

REM ======================================================================
REM  Crea un acceso directo en el ESCRITORIO llamado
REM  "Control M - Imprimir etiquetas" que lanza Imprimir-directo.bat.
REM  Doble clic en ese acceso = Control M listo para imprimir sin preguntar.
REM ======================================================================

set "DESTINO=%~dp0Imprimir-directo.bat"
set "ACCESO=%USERPROFILE%\Desktop\Control M - Imprimir etiquetas.lnk"

echo.
echo   Creando acceso directo en el escritorio...
echo     %ACCESO%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=New-Object -ComObject WScript.Shell;" ^
  "$l=$s.CreateShortcut('%ACCESO%');" ^
  "$l.TargetPath='%DESTINO%';" ^
  "$l.WorkingDirectory='%~dp0';" ^
  "$l.IconLocation='%SystemRoot%\System32\shell32.dll,16';" ^
  "$l.Description='Abre Control M e imprime etiquetas directo por cable';" ^
  "$l.Save()"

if exist "%ACCESO%" (
  echo   [OK] Listo. En el escritorio tienes "Control M - Imprimir etiquetas".
) else (
  echo   [X] No se pudo crear el acceso directo. Puedes usar directamente
  echo       el archivo "Imprimir-directo.bat" de esta carpeta.
)
echo.
pause
endlocal
exit /b 0
