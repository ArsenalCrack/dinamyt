<#
.SYNOPSIS
  Reparte `packages/shared/estilos.css` a los repositorios de Membresias y
  Campeonatos.

.DESCRIPTION
  ── POR QUE HACE FALTA UN GUION PARA COPIAR UN ARCHIVO ─────────────────────

  El portal y Academy importan los estilos del ecosistema por el nombre del
  paquete:

      @import '@dinamyt/shared/estilos.css';

  Membresias y Campeonatos NO pueden: viven en sus propios repositorios y
  a proposito no estan en el workspace de pnpm (ver `pnpm-workspace.yaml`),
  porque meterlos obligaria a resolver sus dependencias contra las de aqui.

  Asi que para ellas el archivo se COPIA, y esa copia hay que mantenerla al
  dia. Es la misma clase de deuda que `productos/`, con el mismo riesgo:
  estar desfasado es silencioso. Por eso el guion avisa cuando la copia ya
  no coincide en vez de sobreescribir sin decir nada.

  ── OJO, VA AL REVES QUE `sync-apps.ps1` ───────────────────────────────────

      sync-apps.ps1        productos/  <-  repositorios de los productos
      repartir-estilos.ps1 packages/   ->  repositorios de los productos

  El destino es el repositorio DE VERDAD, nunca el espejo de `productos/`
  (regla de OPERAR.md 1.1). Despues hay que commitear en cada uno.

.PARAMETER Comprobar
  No escribe: solo dice si alguna copia esta desfasada. Para el ensayo.

.EXAMPLE
  .\scripts\repartir-estilos.ps1
  .\scripts\repartir-estilos.ps1 -Comprobar
#>
param(
    [switch]$Comprobar
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$origen = Join-Path $raiz 'packages/shared/estilos.css'

if (-not (Test-Path $origen)) {
    Write-Error "No esta el origen: $origen"
}

# El nombre del archivo en destino dice de donde viene, para que nadie lo
# edite creyendo que es suyo. La cabecera del propio CSS lo repite.
$destinos = @(
    @{
        Nombre = 'membresias'
        Ruta   = 'D:/Repositorios/dinamyt-membresias/apps/membresias-web/src/app/estilos-ecosistema.css'
    },
    @{
        Nombre = 'campeonatos'
        Ruta   = 'D:/Repositorios/dinamyt-combat/frontend/src/app/estilos-ecosistema.css'
    }
)

$aviso = @"
/* ╔══════════════════════════════════════════════════════════════════════════╗
   ║  ARCHIVO GENERADO — NO SE EDITA AQUI                                     ║
   ║                                                                          ║
   ║  El original vive en el monorepo:                                        ║
   ║      dinamyt/packages/shared/estilos.css                                 ║
   ║                                                                          ║
   ║  Se trae con:  .\scripts\repartir-estilos.ps1                            ║
   ║  Un cambio hecho en esta copia se pierde en el siguiente reparto.        ║
   ╚══════════════════════════════════════════════════════════════════════════╝ */

"@

$contenido = $aviso + (Get-Content $origen -Raw)
$desfasados = 0

foreach ($d in $destinos) {
    $dir = Split-Path -Parent $d.Ruta
    if (-not (Test-Path $dir)) {
        Write-Host "  - $($d.Nombre): no esta el repositorio ($dir). Se salta." -ForegroundColor Yellow
        continue
    }

    $igual = (Test-Path $d.Ruta) -and ((Get-Content $d.Ruta -Raw) -eq $contenido)

    if ($igual) {
        Write-Host "  = $($d.Nombre): al dia" -ForegroundColor DarkGray
        continue
    }

    $desfasados++
    if ($Comprobar) {
        Write-Host "  ! $($d.Nombre): DESFASADO" -ForegroundColor Red
    } else {
        Set-Content -Path $d.Ruta -Value $contenido -NoNewline -Encoding UTF8
        Write-Host "  > $($d.Nombre): actualizado" -ForegroundColor Green
    }
}

if ($Comprobar -and $desfasados -gt 0) {
    Write-Host ""
    Write-Host "$desfasados copia(s) desfasada(s). Corre el guion sin -Comprobar." -ForegroundColor Red
    exit 1
}

if (-not $Comprobar -and $desfasados -gt 0) {
    Write-Host ""
    Write-Host "Hecho. Ahora hay que COMMITEAR en cada repositorio de destino." -ForegroundColor Cyan
}
