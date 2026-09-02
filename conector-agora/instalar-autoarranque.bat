@echo off
REM ============================================================================
REM  Deja el conector arrancando SOLO cada vez que se enciende el PC.
REM  Crea un acceso directo a "arrancar.bat" en la carpeta de Inicio de Windows.
REM  Uso: doble clic en este archivo (una sola vez).
REM ============================================================================
setlocal
set "SRC=%~dp0arrancar.bat"
set "WORK=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut(Join-Path '%STARTUP%' 'Conector Agora.lnk'); $s.TargetPath='%SRC%'; $s.WorkingDirectory='%WORK%'; $s.WindowStyle=7; $s.Description='Conector Agora - Control M'; $s.Save()"

if errorlevel 1 (
  echo  [ERROR] No se pudo crear el autoarranque. Ejecuta este archivo como administrador.
  pause
  exit /b 1
)
echo.
echo  Listo. El conector arrancara solo (minimizado) al encender el PC.
echo  Para probarlo ahora, abre "arrancar.bat".
echo.
pause
