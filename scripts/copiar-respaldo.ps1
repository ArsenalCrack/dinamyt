<#
.SYNOPSIS
  Trae a este PC el último respaldo de la VPS, comprueba que llegó entero y
  deja las últimas 8 fechas.

.DESCRIPTION
  ── Por qué existe ──────────────────────────────────────────────────────────

  El respaldo diario (`dinamyt-respaldo.timer`, OPERAR §2.5) vive en la misma
  máquina que respalda, y un respaldo que solo vive ahí no es un respaldo. Este
  guion es la copia de fuera: la corre una tarea programada de Windows cada
  semana (`$Tarea`, abajo), y se puede correr a mano.

  ── Qué hace ───────────────────────────────────────────────────────────────

  1. Busca en `/var/backups/dinamyt/` la fecha más reciente que tenga LAS DOS
     piezas: `dinamyt-<fecha>.dump` (la base, las tres apps) y
     `archivos-<fecha>.tar.gz` (fotos y archivos).
  2. Las baja a `<nombre>.parcial`, compara su SHA-256 con el del servidor y
     solo entonces les pone su nombre. Si `scp` se corta o la huella no
     coincide, el `.parcial` se borra: una copia a medias con nombre de buena
     es peor que ninguna, porque la rotación la contaría.
  3. Deja las `-Guardar` fechas más recientes que tengan las dos piezas (8 =
     dos meses) y manda a la Papelera todo lo demás con ese nombre exacto. Nada
     más de la carpeta se toca (los volcados de Supabase de agosto, por
     ejemplo). En la Papelera siguen hasta que se vacíe: OPERAR §2.5.
  4. Apunta el resultado en `copias.log`, en la misma carpeta.

  Entra con la llave SSH del usuario de Windows (`~\.ssh`), en BatchMode: si
  pidiera contraseña o preguntara por la huella del servidor, falla en vez de
  quedarse esperando.

  ── La tarea programada ────────────────────────────────────────────────────

  `-Registrar` copia este guion a la carpeta de los respaldos (fuera del repo:
  cambiar de rama no lo borra) y registra o actualiza la tarea apuntando a esa
  copia. Se vuelve a correr cada vez que este archivo cambie.

.EXAMPLE
  pwsh -File .\scripts\copiar-respaldo.ps1
  pwsh -File .\scripts\copiar-respaldo.ps1 -Guardar 4
  pwsh -File .\scripts\copiar-respaldo.ps1 -Registrar
#>
#Requires -Version 7.2
param(
    [string]$Destino = 'D:\dinamyt-migracion\respaldos',
    [ValidateRange(1, 104)]
    [int]$Guardar = 8,
    [string]$Servidor = 'dinamyt@80.190.78.70',
    [string]$Carpeta = '/var/backups/dinamyt',
    [switch]$Registrar
)

$ErrorActionPreference = 'Stop'
$Tarea = 'DINAMYT - copia semanal del respaldo'
$ssh = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30')
$registro = Join-Path $Destino 'copias.log'
$volcado = '^dinamyt-(\d{4}-\d{2}-\d{2})\.dump$'
$archivos = '^archivos-(\d{4}-\d{2}-\d{2})\.tar\.gz$'

New-Item -ItemType Directory -Force -Path $Destino | Out-Null

if ($Registrar) {
    $copia = [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $Destino) 'copiar-respaldo.ps1'))
    # Corriendo desde la propia copia no hay nada que copiar.
    if ([IO.Path]::GetFullPath($PSCommandPath) -ne $copia) {
        Copy-Item -Force -Path $PSCommandPath -Destination $copia
    }
    # La tarea corre con lo mismo que se pidió aquí (menos -Registrar): un
    # `-Guardar 4` o un `-Destino` distinto tienen que llegar a cada domingo.
    $extra = foreach ($p in $PSBoundParameters.GetEnumerator()) {
        if ($p.Key -ne 'Registrar') { "-$($p.Key) `"$($p.Value)`"" }
    }
    $accion = New-ScheduledTaskAction -Execute (Get-Command pwsh).Source `
        -Argument ("-NoProfile -WindowStyle Hidden -File `"$copia`" " + ($extra -join ' ')).Trim()
    $cuando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 11:00
    $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
    $quien = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $Tarea -Force -Action $accion -Trigger $cuando `
        -Settings $ajustes -Principal $quien `
        -Description "Trae el último respaldo de la VPS a $Destino, comprueba el SHA-256 y deja $Guardar fechas. Guion: $copia (copia de scripts\copiar-respaldo.ps1)." |
        Out-Null
    Write-Host "Tarea «$Tarea» apuntando a $copia. Próxima: $((Get-ScheduledTaskInfo -TaskName $Tarea).NextRunTime)"
    exit 0
}

function Apuntar([string]$texto) {
    $linea = "$(Get-Date -Format 'yyyy-MM-dd HH:mm')  $texto"
    Write-Host $linea
    Add-Content -Path $registro -Value $linea -Encoding utf8
}

function Remoto([string]$orden) {
    $salida = & ssh @ssh $Servidor $orden 2>&1
    if ($LASTEXITCODE -ne 0) { throw "ssh falló ($LASTEXITCODE): $salida" }
    return $salida
}

# Las fechas que tienen LAS DOS piezas, de la más reciente a la más vieja.
function FechasCompletas([string[]]$nombres) {
    $fechas = foreach ($n in $nombres) {
        if ($n -match $volcado -and $nombres -contains "archivos-$($Matches[1]).tar.gz") {
            $Matches[1]
        }
    }
    return @($fechas | Sort-Object -Descending)
}

try {
    # 1. La fecha más reciente con las dos piezas.
    $fecha = (FechasCompletas (Remoto "ls -1 $Carpeta")) | Select-Object -First 1
    if (-not $fecha) { throw "No hay en $Carpeta ninguna fecha con el volcado y los archivos." }
    $piezas = @("dinamyt-$fecha.dump", "archivos-$fecha.tar.gz")

    # 2. Bajarlas a .parcial, comprobarlas y solo entonces darles nombre.
    $huellas = Remoto "cd $Carpeta && sha256sum $($piezas -join ' ')"
    foreach ($pieza in $piezas) {
        $local = Join-Path $Destino $pieza
        $parcial = "$local.parcial"
        try {
            & scp @ssh -q "${Servidor}:$Carpeta/$pieza" $parcial
            if ($LASTEXITCODE -ne 0) { throw "scp de $pieza falló ($LASTEXITCODE)." }
            $esperada = ($huellas | Where-Object { $_ -match ([regex]::Escape($pieza) + '$') }) -replace '\s.*$', ''
            $obtenida = (Get-FileHash -Algorithm SHA256 $parcial).Hash.ToLower()
            if ($obtenida -ne $esperada) {
                throw "$pieza llegó distinta (SHA-256 $obtenida, en el servidor $esperada)."
            }
            Move-Item -Force -Path $parcial -Destination $local
        }
        finally {
            if (Test-Path $parcial) { Remove-Item -Force $parcial }
        }
        $kb = [math]::Round((Get-Item $local).Length / 1KB)
        Apuntar "ok  $pieza  $kb KB  sha256 $($obtenida.Substring(0, 12))…"
    }

    # 3. Las $Guardar fechas completas más recientes se quedan; lo demás con
    #    esos nombres, a la Papelera (también una pieza suelta sin su pareja).
    $locales = @(Get-ChildItem -File $Destino | Select-Object -ExpandProperty Name)
    $quedan = FechasCompletas $locales | Select-Object -First $Guardar
    Add-Type -AssemblyName Microsoft.VisualBasic
    foreach ($nombre in $locales) {
        if (($nombre -match $volcado -or $nombre -match $archivos) -and $quedan -notcontains $Matches[1]) {
            [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
                (Join-Path $Destino $nombre), 'OnlyErrorDialogs', 'SendToRecycleBin')
            Apuntar "a la Papelera  $nombre"
        }
    }
}
catch {
    Apuntar "FALLÓ  $($_.Exception.Message)"
    exit 1
}
