<#
.SYNOPSIS
  Pone al dia los espejos de `productos/` con sus repositorios de origen.

.DESCRIPTION
  ── LA REGLA DE ORO ────────────────────────────────────────────────────────
  `productos/campeonatos` y `productos/membresias` son ESPEJOS. El original
  vive en su propio repositorio y ahi es donde se trabaja:

      productos/campeonatos  <-  ArsenalCrack/dinamyt-combat
      productos/membresias   <-  ArsenalCrack/dinamyt-membresias

  **Nunca se editan aqui.** Un cambio hecho dentro de `productos/` se pierde
  en la siguiente sincronizacion, y se pierde en silencio: `git subtree pull`
  no avisa de lo que aplasta.

  Si necesitas tocar Campeonatos o Membresias: abre SU repositorio, haz el
  cambio alli, y luego corre esto.

  ── POR QUE UN ESPEJO Y NO UN MOVIMIENTO ───────────────────────────────────
  Los dos productos siguen desplegandose desde su propio repositorio (el VPS
  clona los tres). El espejo esta para que este monorepo tenga el codigo
  ACTUAL y no las versiones abandonadas que tenia antes — que se habian
  quedado tan atras que eran otro producto— y para que `packages/shared`
  conviva con quienes lo consumen.

.PARAMETER Producto
  Sincronizar solo uno: campeonatos o membresias.

.PARAMETER Local
  Tirar de las copias locales del disco en vez de GitHub. Util cuando el
  trabajo todavia no esta empujado.

.EXAMPLE
  .\scripts\sync-apps.ps1
  .\scripts\sync-apps.ps1 -Producto membresias
  .\scripts\sync-apps.ps1 -Local
#>

[CmdletBinding()]
param(
    [ValidateSet('campeonatos', 'membresias')]
    [string]$Producto,
    [switch]$Local
)

$ErrorActionPreference = 'Stop'

$espejos = @(
    @{ Nombre = 'campeonatos'
       Prefijo = 'productos/campeonatos'
       Remoto  = 'https://github.com/ArsenalCrack/dinamyt-combat.git'
       Disco   = 'D:\hapkido\DINAMYT-LOCAL - copia'
       Rama    = 'main' }

    @{ Nombre = 'membresias'
       Prefijo = 'productos/membresias'
       Remoto  = 'https://github.com/ArsenalCrack/dinamyt-membresias.git'
       Disco   = 'D:\Repositorios\dinamyt-membresias'
       Rama    = 'main' }
)

if ($Producto) { $espejos = $espejos | Where-Object { $_.Nombre -eq $Producto } }

# Un subtree pull sobre un arbol sucio deja un conflicto a medias que hay que
# deshacer a mano. Mejor negarse antes de empezar.
if (git status --porcelain) {
    throw "Hay cambios sin commitear en este repositorio. Guardalos antes de sincronizar."
}

foreach ($e in $espejos) {
    $origen = if ($Local) { $e.Disco } else { $e.Remoto }

    Write-Host ""
    Write-Host "── $($e.Nombre)" -ForegroundColor Cyan
    Write-Host "   $($e.Prefijo)  <-  $origen  ($($e.Rama))" -ForegroundColor DarkGray

    $antes = git rev-parse HEAD

    # --squash: un commit por sincronizacion en vez de replicar cada commit del
    # otro repositorio. El historial de alla ya esta alla; aqui solo interesa
    # "esto es lo que habia el dia tal".
    git subtree pull --prefix=$($e.Prefijo) $origen $($e.Rama) --squash `
        -m "sync($($e.Nombre)): al dia con $($e.Rama)"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "   FALLO. Si hay conflicto, resuelvelo y haz commit; si no," -ForegroundColor Red
        Write-Host "   'git merge --abort' y a mirar que paso." -ForegroundColor Red
        exit 1
    }

    if ((git rev-parse HEAD) -eq $antes) {
        Write-Host "   ya estaba al dia" -ForegroundColor DarkGray
    } else {
        Write-Host "   actualizado" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Listo. Recuerda: lo de productos/ NO se edita aqui." -ForegroundColor Yellow
