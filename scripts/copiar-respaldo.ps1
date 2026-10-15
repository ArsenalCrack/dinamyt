<#
.SYNOPSIS
  Trae a este PC el último respaldo de la VPS, comprueba que llegó entero y
  deja las últimas 8 copias.

.DESCRIPTION
  ── Por qué existe ──────────────────────────────────────────────────────────

  El respaldo diario (`dinamyt-respaldo.timer`, OPERAR §2.5) vive en la misma
  máquina que respalda, y un respaldo que solo vive ahí no es un respaldo. Este
  guion es la copia de fuera: la corre una tarea programada de Windows cada
  semana («DINAMYT · copia semanal del respaldo»), y se puede correr a mano.

  ── Qué hace ───────────────────────────────────────────────────────────────

  1. Busca en `/var/backups/dinamyt/` la fecha más reciente que tenga LAS DOS
     piezas: `dinamyt-<fecha>.dump` (la base, las tres apps) y
     `archivos-<fecha>.tar.gz` (fotos y archivos).
  2. Las trae con `scp` y compara su SHA-256 con el del servidor. Si no
     coincide, borra la copia mala y falla: una copia corrupta que parece buena
     es peor que ninguna.
  3. Deja las últimas `-Guardar` de cada pieza (8 = dos meses) y manda las más
     viejas a la Papelera. Solo toca archivos con ese nombre exacto: nada más
     de la carpeta (los volcados de Supabase de agosto, por ejemplo).
  4. Apunta el resultado en `copias.log`, en la misma carpeta.

  La política de privacidad dice que las copias fuera del servidor «se
  renuevan»: el paso 3 es lo que lo hace verdad. Si cambia `-Guardar`, no cambia
  el texto, pero sí cuánto puede seguir ahí alguien que pidió borrar su cuenta.

  Entra con la llave SSH del usuario de Windows (`~\.ssh`), en modo BatchMode:
  si la llave pidiera contraseña, falla en vez de quedarse esperando.

.EXAMPLE
  pwsh -File .\scripts\copiar-respaldo.ps1
  pwsh -File .\scripts\copiar-respaldo.ps1 -Guardar 4
#>
#Requires -Version 7.0
param(
    [string]$Destino = 'D:\dinamyt-migracion\respaldos',
    [int]$Guardar = 8,
    [string]$Servidor = 'dinamyt@80.190.78.70',
    [string]$Carpeta = '/var/backups/dinamyt'
)

$ErrorActionPreference = 'Stop'
$ssh = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30')
$registro = Join-Path $Destino 'copias.log'

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

New-Item -ItemType Directory -Force -Path $Destino | Out-Null

try {
    # 1. La fecha más reciente con las dos piezas.
    $nombres = Remoto "ls -1 $Carpeta"
    $fechas = foreach ($n in $nombres) {
        if ($n -match '^dinamyt-(\d{4}-\d{2}-\d{2})\.dump$' -and
            $nombres -contains "archivos-$($Matches[1]).tar.gz") {
            $Matches[1]
        }
    }
    $fechas = $fechas | Sort-Object -Descending
    if (-not $fechas) { throw "No hay en $Carpeta ninguna fecha con el volcado y los archivos." }
    $fecha = @($fechas)[0]
    $piezas = @("dinamyt-$fecha.dump", "archivos-$fecha.tar.gz")

    # 2. Traerlas y comprobarlas.
    $huellas = Remoto "cd $Carpeta && sha256sum $($piezas -join ' ')"
    foreach ($pieza in $piezas) {
        $local = Join-Path $Destino $pieza
        & scp @ssh -q "${Servidor}:$Carpeta/$pieza" $local
        if ($LASTEXITCODE -ne 0) { throw "scp de $pieza falló ($LASTEXITCODE)." }
        $esperada = ($huellas | Where-Object { $_ -match [regex]::Escape($pieza) + '$' }) -replace '\s.*$', ''
        $obtenida = (Get-FileHash -Algorithm SHA256 $local).Hash.ToLower()
        if ($obtenida -ne $esperada) {
            Remove-Item -Force $local
            throw "$pieza llegó distinta (SHA-256 $obtenida, en el servidor $esperada). Se borró la copia."
        }
        $kb = [math]::Round((Get-Item $local).Length / 1KB)
        Apuntar "ok  $pieza  $kb KB  sha256 $($obtenida.Substring(0, 12))…"
    }

    # 3. Las últimas $Guardar de cada pieza; las demás, a la Papelera.
    Add-Type -AssemblyName Microsoft.VisualBasic
    foreach ($patron in '^dinamyt-\d{4}-\d{2}-\d{2}\.dump$', '^archivos-\d{4}-\d{2}-\d{2}\.tar\.gz$') {
        Get-ChildItem -File $Destino |
            Where-Object { $_.Name -match $patron } |
            Sort-Object Name -Descending |
            Select-Object -Skip $Guardar |
            ForEach-Object {
                [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
                    $_.FullName, 'OnlyErrorDialogs', 'SendToRecycleBin')
                Apuntar "a la Papelera  $($_.Name)"
            }
    }
}
catch {
    Apuntar "FALLÓ  $($_.Exception.Message)"
    exit 1
}
