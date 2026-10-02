# ============================================================================
#  Conector Agora -> Control M  ·  Instalador de la TAREA DEL SISTEMA
#  Registra una tarea que:
#    · arranca el conector al ENCENDER el PC (aunque nadie inicie sesion),
#    · lo REINICIA solo si se cae, y cada 10 min comprueba que sigue vivo,
#    · corre oculto en segundo plano como SYSTEM.
#  No se ejecuta a mano: lo lanza instalar-autoarranque.bat (como admin).
# ============================================================================
$ErrorActionPreference = 'Stop'
$tarea = 'Conector Agora Control M'
$dir   = $PSScriptRoot
$bat   = Join-Path $dir 'arrancar.bat'

if (-not (Test-Path $bat)) { throw "No se encuentra arrancar.bat junto a este instalador ($bat)." }

# Accion: ejecutar el lanzador robusto (que a su vez reintenta si node se cae).
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c "' + $bat + '"') -WorkingDirectory $dir

# Disparador: al arrancar el PC + comprobacion cada 10 min (revive si murio).
$trigger = New-ScheduledTaskTrigger -AtStartup
$rep = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
          -RepetitionInterval (New-TimeSpan -Minutes 10) `
          -RepetitionDuration  (New-TimeSpan -Days 3650)).Repetition
$trigger.Repetition = $rep

# Ejecutar como SYSTEM (no necesita que nadie inicie sesion), maximos permisos.
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

# Sin limite de tiempo, no arrancar otra instancia si ya corre, reiniciar si falla.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
              -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999 -StartWhenAvailable

Register-ScheduledTask -TaskName $tarea -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

Start-ScheduledTask -TaskName $tarea
Write-Host 'OK: tarea creada y arrancada.'
