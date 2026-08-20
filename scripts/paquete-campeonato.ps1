<#
.SYNOPSIS
  Descarga el paquete completo de un campeonato del servidor ONLINE y lo guarda
  fechado en tu PC, listo para importarlo en el DINAMYT local.

.DESCRIPTION
  ── PARA QUÉ ────────────────────────────────────────────────────────────────
  El día del evento el campeonato NO corre en el VPS: corre en un PC del
  polideportivo, sin internet. Para eso hay que llevarse el campeonato entero
  (maestros, jueces, competidores, inscripciones, tatamis, asignaciones y
  llaves) en un archivo.

  Eso ya se puede hacer a mano desde la web —«⬆️ Exportar campeonato»—, y esto
  hace exactamente lo mismo por la API. La diferencia es que se puede repetir
  todos los días de la semana previa sin abrir el navegador, guarda cada copia
  con su fecha y comprueba que el archivo se lee antes de darlo por bueno.

  ── LA REGLA QUE HAY QUE ENTENDER ───────────────────────────────────────────
  **El paquete se saca del servidor que está VIVO.** Si el VPS se cae el día del
  campeonato, ya no hay de dónde exportar. Por eso esto se corre ANTES: la
  víspera y la mañana del evento. Un paquete de ayer sirve; uno que no existe,
  no.

  ── LO QUE NO VIAJA ─────────────────────────────────────────────────────────
  Las contraseñas. Los usuarios se crean en el local sin clave utilizable: los
  jueces entran con el QR de su tatami, que no pide contraseña. El admin del
  local usa la suya, la del local, que tienes que haber probado antes.

.PARAMETER Campeonato
  Id del campeonato en el servidor online (sale en la URL: /campeonatos/12).

.PARAMETER Correo
  Correo del administrador. Si no se pasa, se toma de DINAMYT_ADMIN_EMAIL.

.PARAMETER Origen
  Servidor del que se descarga. Por defecto, el de producción.

.PARAMETER Destino
  Carpeta donde se guardan los paquetes. Por defecto D:\dinamyt-respaldos.

.PARAMETER Usb
  Ruta opcional (una memoria USB) donde dejar una segunda copia.

.EXAMPLE
  .\scripts\paquete-campeonato.ps1 -Campeonato 12

.EXAMPLE
  .\scripts\paquete-campeonato.ps1 -Campeonato 12 -Usb E:\dinamyt
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][int]$Campeonato,
    [string]$Correo = $env:DINAMYT_ADMIN_EMAIL,
    [string]$Origen = 'https://campeonatos.dinamyt.org',
    [string]$Destino = 'D:\dinamyt-respaldos',
    [string]$Usb
)

$ErrorActionPreference = 'Stop'

if (-not $Correo) {
    $Correo = Read-Host 'Correo del administrador'
}

# La contraseña se pide aquí y no se guarda en ningún sitio: ni en el guion, ni
# en el historial de PowerShell, ni en un archivo de configuracion.
$clave = Read-Host "Contrasena de $Correo" -AsSecureString
$clavePlana = [System.Net.NetworkCredential]::new('', $clave).Password

Write-Host "→ Entrando en $Origen" -ForegroundColor Cyan
try {
    $sesion = Invoke-RestMethod -Method Post -Uri "$Origen/api/auth/login" `
        -ContentType 'application/json' `
        -Body (@{ email = $Correo; password = $clavePlana } | ConvertTo-Json)
}
catch {
    throw "No se pudo iniciar sesion en $Origen : $($_.Exception.Message)"
}
finally {
    $clavePlana = $null
}

if (-not $sesion.token) { throw 'El servidor no devolvio un token.' }
Write-Host "  entrado como $($sesion.user.nombre) ($($sesion.user.rol))" -ForegroundColor DarkGray

# ── La descarga ─────────────────────────────────────────────────────────────
# Las tres banderas en 1: el paquete tiene que ser AUTO-CONTENIDO. Un paquete
# sin usuarios deja las asignaciones de jueces apuntando a gente que no existe
# en la otra instancia.
$url = "$Origen/api/sincronizacion/campeonato/$Campeonato/exportar?usuarios=1&competidores=1&llaves=1"

if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Force $Destino | Out-Null }
$marca = Get-Date -Format 'yyyy-MM-dd_HHmm'
$archivo = Join-Path $Destino "campeonato-$Campeonato-$marca.json"

Write-Host "→ Descargando el paquete" -ForegroundColor Cyan
Invoke-WebRequest -Uri $url -Headers @{ Authorization = "Bearer $($sesion.token)" } `
    -OutFile $archivo | Out-Null

# ── La comprobación ─────────────────────────────────────────────────────────
# Un archivo descargado no es un archivo válido: si la sesión caducó a mitad, lo
# que queda en el disco es un JSON de error de 80 bytes con nombre de respaldo.
$paquete = Get-Content $archivo -Raw | ConvertFrom-Json
if (-not $paquete.campeonato) {
    Remove-Item $archivo
    throw 'Lo descargado no es un paquete de campeonato. Nada que guardar.'
}

$peso = [math]::Round((Get-Item $archivo).Length / 1KB, 1)

Write-Host ''
Write-Host "  Campeonato : $($paquete.campeonato.nombre)"
Write-Host "  Incluye    : $($paquete.incluye -join ', ')"
Write-Host "  Usuarios   : $(@($paquete.usuarios).Count)"
Write-Host "  Competidores: $(@($paquete.competidores).Count)"
Write-Host "  Inscripciones: $(@($paquete.inscripciones).Count)"
Write-Host "  Tatamis    : $(@($paquete.tatamis).Count)"
Write-Host "  Llaves     : $(@($paquete.llaves).Count)"
Write-Host ''
Write-Host "✔ $archivo  ($peso KB)" -ForegroundColor Green

if ($Usb) {
    if (-not (Test-Path $Usb)) { New-Item -ItemType Directory -Force $Usb | Out-Null }
    Copy-Item $archivo -Destination $Usb
    Write-Host "✔ Copia en $Usb" -ForegroundColor Green
}

Write-Host ''
Write-Host 'Siguiente paso: en el PC del evento, /admin → Campeonatos → «⬇️ Importar campeonato»,' -ForegroundColor DarkGray
Write-Host 'analizar el archivo, revisar el resumen y confirmar.' -ForegroundColor DarkGray
