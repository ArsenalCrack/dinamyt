<#
.SYNOPSIS
  Restaura un volcado en una base de usar y tirar y cuenta lo que trae.

.DESCRIPTION
  «Prueba el restore, no el backup.» Un archivo que pesa lo que debe puede estar
  perfectamente corrupto, y eso no se descubre el dia que hace falta: se
  descubre AHORA o no se descubre.

  Crea una base temporal, restaura ahi el volcado, cuenta las filas de cada
  tabla y borra la base. No toca nada mas.

  Es el mismo procedimiento que hay que correr en el VPS despues de restaurar
  (§3.3-d del plan) y una vez al mes sobre el respaldo de la noche.

.PARAMETER Dump
  El archivo .dump a comprobar.

.PARAMETER Servidor / Puerto / Usuario
  Donde crear la base temporal. Por defecto, el PostgreSQL 17 local.

.PARAMETER Conservar
  No borrar la base temporal al terminar, para entrar a mirar a mano.

.NOTES
  La contrasena se pide por pantalla y no se guarda en ningun sitio. Si
  prefieres no escribirla cada vez, exporta PGPASSWORD antes de llamar.

.EXAMPLE
  .\scripts\verificar-respaldo.ps1 -Dump D:\dinamyt-migracion\respaldos\membresias_2026-08-19_1136.dump
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Dump,
    [string]$Servidor = '127.0.0.1',
    [int]$Puerto = 5432,
    [string]$Usuario = 'postgres',
    [string]$PgVersion = '17',
    [switch]$Conservar
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Dump)) { throw "No existe $Dump" }

$bin = "C:\Program Files\PostgreSQL\$PgVersion\bin"
foreach ($exe in 'psql', 'pg_restore') {
    if (-not (Test-Path "$bin\$exe.exe")) { throw "No encuentro $exe en $bin" }
}

if (-not $env:PGPASSWORD) {
    $sec = Read-Host "Contrasena de '$Usuario' en ${Servidor}:${Puerto}" -AsSecureString
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}

$comun = @('-w', '-h', $Servidor, '-p', $Puerto, '-U', $Usuario)
$base  = 'verif_' + (Get-Date -Format 'HHmmss')

function Psql([string]$db, [string]$sql) {
    & "$bin\psql.exe" @comun -d $db -tAF '|' -c $sql
}

Write-Host "Volcado : $(Split-Path $Dump -Leaf)  ($([math]::Round((Get-Item $Dump).Length/1KB,1)) KB)" -ForegroundColor Cyan
Write-Host "Base     : $base (temporal)" -ForegroundColor DarkGray

Psql 'postgres' "CREATE DATABASE $base" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "No pude crear la base temporal. Revisa usuario y contrasena." }

try {
    # pg_restore devuelve != 0 por avisos que no son fallos (dueños y permisos
    # que no existen aquí). Lo que decide es si al final hay tablas con filas.
    $errores = & "$bin\pg_restore.exe" @comun -d $base --no-owner --no-privileges $Dump 2>&1 |
               Where-Object { $_ -match 'error|ERROR|FATAL' }

    $filas = Psql $base @"
SELECT n.nspname || '.' || c.relname || '|' ||
       (SELECT count(*) FROM pg_catalog.pg_class WHERE oid = c.oid) * 0 +
       coalesce((xpath('/row/c/text()',
         query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname),
                      false, true, '')))[1]::text::bigint, 0)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'r'
   AND n.nspname NOT IN ('pg_catalog','information_schema')
 ORDER BY 1
"@

    $total = 0; $conDatos = 0; $porEsquema = @{}
    Write-Host ""
    foreach ($l in $filas) {
        if (-not $l) { continue }
        $tabla, $n = $l -split '\|', 2
        $n = [int]$n
        $total += $n
        if ($n -gt 0) { $conDatos++ }
        $esq = ($tabla -split '\.')[0]
        $porEsquema[$esq] = ($porEsquema[$esq] ?? 0) + $n
        $color = if ($n -gt 0) { 'Gray' } else { 'DarkGray' }
        Write-Host ("  {0,-52} {1,8}" -f $tabla, $n) -ForegroundColor $color
    }

    Write-Host ""
    foreach ($e in $porEsquema.Keys | Sort-Object) {
        Write-Host ("  esquema {0,-20} {1,8} filas" -f $e, $porEsquema[$e]) -ForegroundColor Cyan
    }
    Write-Host ("  {0,-28} {1,8} filas en {2} tablas con datos" -f 'TOTAL', $total, $conDatos) -ForegroundColor Cyan
    Write-Host ""

    if ($errores) {
        Write-Host "pg_restore se quejo de:" -ForegroundColor Yellow
        $errores | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    }

    if ($total -eq 0) {
        Write-Host "EL VOLCADO NO TRAE NI UNA FILA. No sirve como respaldo." -ForegroundColor Red
        exit 1
    }
    Write-Host "El volcado se restaura y trae datos." -ForegroundColor Green
    Write-Host "Ahora entra a mirar: un conteo cuadrado no dice que el contenido sea el bueno." -ForegroundColor Yellow
}
finally {
    if ($Conservar) {
        Write-Host "Base conservada: $base" -ForegroundColor DarkGray
    } else {
        Psql 'postgres' "DROP DATABASE IF EXISTS $base" | Out-Null
        Write-Host "Base temporal borrada." -ForegroundColor DarkGray
    }
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
