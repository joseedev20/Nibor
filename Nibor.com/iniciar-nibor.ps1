param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppUrl = "http://localhost:5173/"

Set-Location $ProjectRoot

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "OK  $Message" -ForegroundColor Green
}

function Test-Http {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Find-CommandPath {
  param([string[]]$Names)
  foreach ($name in $Names) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }
  return $null
}

$NodeCommand = Find-CommandPath @("node.exe", "node")
$NpmCommand = Find-CommandPath @("npm.cmd", "npm.exe", "npm")

if (-not $NodeCommand) {
  Write-Host "No encontre Node.js. Instala Node.js LTS y vuelve a ejecutar este archivo." -ForegroundColor Red
  exit 1
}

if (-not $NpmCommand) {
  Write-Host "No encontre npm. Reinstala Node.js LTS incluyendo npm." -ForegroundColor Red
  exit 1
}

function Invoke-Npm {
  param([string[]]$Arguments)
  & $script:NpmCommand @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') fallo con codigo $LASTEXITCODE"
  }
}

Write-Step "Proyecto"
Write-Host $ProjectRoot
Write-Ok "Node: $(& $NodeCommand --version)"
Write-Ok "npm: $(& $NpmCommand --version)"

if (Test-Http $AppUrl) {
  Write-Step "Nibor.com ya esta activo"
  Start-Process $AppUrl
  Write-Host "Abri $AppUrl en el navegador."
  exit 0
}

if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  Write-Step "Instalando dependencias"
  Invoke-Npm @("install")
} else {
  Write-Ok "Dependencias encontradas"
}

Write-Step "Aplicando migraciones locales de D1"
$OldCi = $env:CI
$env:CI = "1"
try {
  Invoke-Npm @("run", "db:migrate:local")
} finally {
  if ($null -eq $OldCi) {
    Remove-Item Env:\CI -ErrorAction SilentlyContinue
  } else {
    $env:CI = $OldCi
  }
}

if ($CheckOnly) {
  Write-Ok "Chequeo completado. Ejecuta sin -CheckOnly para levantar la app."
  exit 0
}

Write-Step "Levantando Nibor.com"
Write-Host "Cuando quieras apagarlo, vuelve a esta ventana y presiona Ctrl+C."
Write-Host "La app se abrira sola cuando responda $AppUrl"

$OpenBrowserJob = Start-Job -ScriptBlock {
  param([string]$Url)

  for ($attempt = 1; $attempt -le 90; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Start-Process $Url
        return
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
} -ArgumentList $AppUrl

try {
  & $NpmCommand run dev
} finally {
  if ($OpenBrowserJob) {
    Stop-Job $OpenBrowserJob -ErrorAction SilentlyContinue | Out-Null
    Remove-Job $OpenBrowserJob -ErrorAction SilentlyContinue | Out-Null
  }
}
