<#
.SYNOPSIS
  Vuelca las tres bases de produccion de DINAMYT antes de la mudanza al VPS.

.DESCRIPTION
  Es el bloque B0 del plan (PLAN-ECOSYSTEM-VPS.md): el unico respaldo que
  tendremos. Render esta suspendido, asi que no hay marcha atras a la que
  volver — estos archivos SON la marcha atras.

  Lee las cadenas de conexion de un archivo `.env.migracion` que NO va al
  repositorio. Nunca las imprime.

.NOTES
  ── El archivo .env.migracion ──────────────────────────────────────────────
  Creado a mano, fuera de cualquier repo (por ejemplo D:\dinamyt-migracion\).
  Tres lineas, con la contrasena REAL:

    ECO_URL=postgresql://postgres.yabnklhtfknwvpgadacp:CLAVE@aws-1-us-west-2.pooler.supabase.com:5432/postgres
    MEMB_URL=postgresql://postgres.lhgisckrvyfqjslbzpuj:CLAVE@aws-1-us-west-2.pooler.supabase.com:5432/postgres
    CAMP_URL=postgresql://postgres.zcenyqtgaqqsmhjccwck:CLAVE@aws-1-us-east-2.pooler.supabase.com:5432/postgres

  ── OJO AL PUERTO: 5432, NO 6543 ───────────────────────────────────────────
  El 6543 de Supabase es el "transaction pooler": reparte cada sentencia por
  una conexion distinta del pool. pg_dump necesita lo contrario — una sesion
  estable con su transaccion y sus cursores abiertos de principio a fin — y
  contra el 6543 falla, o peor, saca un volcado incompleto sin decir nada.
  El 5432 es el "session pooler" y ahi si funciona. Si el panel de Supabase
  ofrece la conexion directa, tambien sirve.

  Este guion avisa si detecta el 6543.

.EXAMPLE
  .\scripts\respaldar-produccion.ps1 -Env D:\dinamyt-migracion\.env.migracion -Destino D:\dinamyt-migracion\respaldos
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Env,
    [Parameter(Mandatory = $true)][string]$Destino,
    # 17 y no "la mas nueva" a proposito: el formato `custom` que produce
    # pg_dump lo lee pg_restore de su version o posterior, nunca anterior. Un
    # volcado hecho con la 18 NO se restaura en el PostgreSQL 17 del VPS.
    # Aqui se fija la 17, que es la que va a correr alli: madura, y la misma
    # rama que sirve Supabase.
    [string]$PgVersion = '17',
    # Repetir solo una de las tres, cuando una falla y las otras ya salieron.
    # Volver a volcar lo que ya esta bien no es gratis: son minutos y trafico
    # contra una base de produccion.
    [ValidateSet('eco_acad', 'membresias', 'campeonatos')]
    [string]$Solo
)

$ErrorActionPreference = 'Stop'

# ── pg_dump ──────────────────────────────────────────────────────────────────
$pgDump = "C:\Program Files\PostgreSQL\$PgVersion\bin\pg_dump.exe"
if (-not (Test-Path $pgDump)) {
    $hay = (Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
            ForEach-Object { $_.Directory.Parent.Name }) -join ', '
    throw "No hay pg_dump $PgVersion. Instalados: $hay. " +
          "Usa la version que vaya a correr en el VPS, o pasa -PgVersion."
}
Write-Host "pg_dump: $pgDump" -ForegroundColor DarkGray
& $pgDump --version

# ── Cadenas de conexion ──────────────────────────────────────────────────────
if (-not (Test-Path $Env)) { throw "No existe $Env. Ver las notas de cabecera de este guion." }

$cadenas = @{}
foreach ($linea in Get-Content $Env) {
    if ($linea -match '^\s*#' -or $linea -notmatch '=') { continue }
    $i = $linea.IndexOf('=')
    $cadenas[$linea.Substring(0, $i).Trim()] = $linea.Substring($i + 1).Trim()
}

# ── Qué se vuelca de dónde ───────────────────────────────────────────────────
# Cada esquema tiene UN origen correcto y al menos uno equivocado con el mismo
# nombre. Ver §3.2 del plan: restaurar el `membresias` del proyecto del
# ecosistema es el error que borra el club entero.
$trabajos = @(
    @{ Nombre = 'eco_acad'; Clave = 'ECO_URL';
       Esquemas = @('ecosystem', 'academy', 'drizzle')
       Nota = 'ecosystem + academy + el diario COMPARTIDO de los dos' }

    @{ Nombre = 'membresias'; Clave = 'MEMB_URL';
       Esquemas = @('membresias', 'drizzle')
       Nota = 'proyecto lhgisckr... — la version BUENA, migracion 0014' }

    @{ Nombre = 'campeonatos'; Clave = 'CAMP_URL';
       Esquemas = @('public')
       Nota = 'proyecto zceny... — Flask, sus tablas viven en public' }
)

if ($Solo) {
    $trabajos = $trabajos | Where-Object { $_.Nombre -eq $Solo }
    Write-Host "Solo: $Solo" -ForegroundColor DarkGray
}

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$sello = Get-Date -Format 'yyyy-MM-dd_HHmm'
$fallos = @()

foreach ($t in $trabajos) {
    $url = $cadenas[$t.Clave]
    if (-not $url) { $fallos += "$($t.Clave) no esta en $Env"; continue }

    if ($url -match ':6543/') {
        Write-Host ""
        Write-Host "  AVISO: $($t.Clave) usa el puerto 6543 (transaction pooler)." -ForegroundColor Yellow
        Write-Host "  pg_dump necesita una sesion estable. Cambialo a 5432." -ForegroundColor Yellow
        Write-Host ""
    }

    $salida = Join-Path $Destino "$($t.Nombre)_$sello.dump"
    $args = @('--no-owner', '--no-privileges', '--format=custom', '--verbose')
    foreach ($e in $t.Esquemas) { $args += @('--schema', $e) }
    $args += @('--file', $salida, $url)

    Write-Host ""
    Write-Host "── $($t.Nombre) ─ $($t.Nota)" -ForegroundColor Cyan
    Write-Host "   esquemas: $($t.Esquemas -join ', ')" -ForegroundColor DarkGray

    # 2>&1 para no perder el --verbose, que es lo unico que dice si se quedo
    # a medias. La URL no se imprime nunca.
    & $pgDump @args 2>&1 | Where-Object { $_ -match 'dumping contents of table|error|ERROR|FATAL' } |
        ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }

    if ($LASTEXITCODE -ne 0) {
        $fallos += "$($t.Nombre): pg_dump salio con codigo $LASTEXITCODE"
        Write-Host "   FALLO (codigo $LASTEXITCODE)" -ForegroundColor Red
        continue
    }

    $kb = [math]::Round((Get-Item $salida).Length / 1KB, 1)
    Write-Host "   OK -> $(Split-Path $salida -Leaf)  ($kb KB)" -ForegroundColor Green

    # Un volcado que no se puede leer no es un volcado. `pg_restore --list` lee
    # el indice del archivo entero: si esta truncado, se ve aqui y no dentro de
    # tres semanas.
    $pgRestore = $pgDump -replace 'pg_dump\.exe$', 'pg_restore.exe'
    $tablas = (& $pgRestore --list $salida | Where-Object { $_ -match '\sTABLE DATA\s' }).Count
    Write-Host "   indice legible: $tablas tablas con datos" -ForegroundColor Green
    if ($tablas -eq 0) { $fallos += "$($t.Nombre): el volcado no trae NINGUNA tabla con datos" }
}

Write-Host ""
if ($fallos.Count -gt 0) {
    Write-Host "NO esta respaldado:" -ForegroundColor Red
    $fallos | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "Los tres volcados estan en $Destino" -ForegroundColor Green
Write-Host ""
Write-Host "Falta lo que de verdad los convierte en respaldo:" -ForegroundColor Yellow
Write-Host "  1. Copiarlos FUERA de este equipo (disco externo o nube)." -ForegroundColor Yellow
Write-Host "  2. Restaurar uno en una base vacia y entrar a mirar." -ForegroundColor Yellow
Write-Host "     Un respaldo que nunca se restauro no es un respaldo." -ForegroundColor Yellow
