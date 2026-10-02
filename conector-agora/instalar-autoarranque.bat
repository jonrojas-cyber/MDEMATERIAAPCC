@echo off
REM ============================================================================
REM  Deja el conector corriendo SOLO, para siempre, en este PC (el del TPV).
REM  Crea una TAREA DEL SISTEMA que:
REM    - arranca el conector al ENCENDER el PC (aunque nadie inicie sesion),
REM    - lo REINICIA solo si se cae (y cada 10 min comprueba que sigue vivo),
REM    - corre oculto en segundo plano (no hay ventana que cerrar sin querer).
REM
REM  USO: clic DERECHO en este archivo -> "Ejecutar como administrador".
REM       (una sola vez). Para ver que funciona, mira en Control M
REM       Informes -> "Ventas . Agora", o el archivo conector.log.
REM ============================================================================
setlocal
set "PS1=%~dp0instalar-servicio.ps1"

REM --- Pedir permisos de administrador si no los tiene -------------------------
net session >nul 2>&1
if errorlevel 1 (
  echo  Se necesitan permisos de administrador. Pidiendolos...
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
  exit /b
)

REM --- Quitar el autoarranque antiguo (acceso directo en Inicio), si existe ----
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Conector Agora.lnk" >nul 2>&1

REM --- Registrar la tarea del sistema -----------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
if errorlevel 1 (
  echo.
  echo  [ERROR] No se pudo crear la tarea. Ejecuta este archivo como ADMINISTRADOR
  echo          (clic derecho - Ejecutar como administrador).
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================================
echo   LISTO. El conector ya corre solo y arrancara al encender.
echo  ============================================================
echo.
echo   - Se reinicia solo si se cae (y cada 10 min se comprueba).
echo   - No hay ventana que cerrar: corre en segundo plano.
echo   - Comprobar que entra venta: Control M -^> Informes -^> "Ventas . Agora".
echo   - Registro tecnico: %~dp0conector.log
echo.
echo   Para pararlo algun dia: en "Programador de tareas" de Windows,
echo   busca "Conector Agora Control M" y deshabilitala.
echo.
pause
