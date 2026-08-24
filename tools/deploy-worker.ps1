# Carruleddhi - build the site and put the Worker live, in the right order.
#
# WHY THE ORDER MATTERS
#   `wrangler secret put` needs the Worker to already exist, so the very first
#   deploy has to happen before any secret can be set. That first deploy is
#   therefore a working site with dead forms: every POST answers 503
#   NOT_CONFIGURED until MAKE_WEBHOOK_URL is in place. That is expected, not a
#   failure.
#
# WHAT THIS SCRIPT DOES
#   1. npm run build                     (dist/ is what the Worker serves)
#   2. wrangler deploy                   (creates or updates the Worker)
#   3. reports which secrets are set and which are missing
#   4. optionally walks you through the missing ones
#
# It never prints a secret value. wrangler asks for each one on its own prompt.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools\deploy-worker.ps1
#   powershell -ExecutionPolicy Bypass -File tools\deploy-worker.ps1 -SkipBuild
#   powershell -ExecutionPolicy Bypass -File tools\deploy-worker.ps1 -CheckOnly

[CmdletBinding()]
param(
  [switch]$SkipBuild,
  # Report the state and change nothing. Safe to run any time.
  [switch]$CheckOnly
)

# Continue, not Stop. Everything here is an external command, and wrangler writes
# normal progress to stderr; with Stop the first such line is promoted to a
# terminating PowerShell error and the script dies on a successful call. Exit codes
# are checked explicitly instead.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$workerDir = Join-Path $root 'worker'

# Required for the site to actually work, versus nice to have.
$required = @(
  @{ Name = 'MAKE_WEBHOOK_URL'; What = 'zapisy, kontakt, przypomnienia (adres webhooka Make)' }
)
$optional = @(
  @{ Name = 'ROSTER_KEY';           What = 'lista uczestnikow ORAZ moderacja tablicy (sekcje 08 i 09)' },
  @{ Name = 'SUPABASE_URL';         What = 'tablica, licznik obecnosci, prawdziwe inicjaly' },
  @{ Name = 'SUPABASE_SERVICE_KEY'; What = 'to samo (klucz service_role, nie anon)' },
  @{ Name = 'WALL_SALT';            What = 'sol do skrotu IP - bez niej limit jest slabszy' },
  @{ Name = 'INTAKE_SHARED_KEY';    What = 'opcjonalny naglowek serwer-serwer do Make' },
  @{ Name = 'TURNSTILE_SECRET';     What = 'opcjonalna captcha Cloudflare' }
)

function Write-Head($text) {
  Write-Host ''
  Write-Host "=== $text ===" -ForegroundColor Yellow
}

Write-Head 'Kto jest zalogowany'
Push-Location $workerDir
try {
  $who = npx wrangler whoami 2>&1 | Out-String
  if ($who -match 'associated with the email ([^\s,\.]+)') {
    Write-Host "  konto: $($Matches[1])" -ForegroundColor Green
  } else {
    Write-Host '  NIE JESTES ZALOGOWANY. Uruchom: npx wrangler login' -ForegroundColor Red
    exit 1
  }

  if (-not $CheckOnly) {
    if (-not $SkipBuild) {
      Write-Head 'Budowanie strony'
      Pop-Location
      Push-Location $root
      npm run build
      if ($LASTEXITCODE -ne 0) { Write-Host '  build padl, przerywam' -ForegroundColor Red; exit 1 }
      Pop-Location
      Push-Location $workerDir
    }

    Write-Head 'Wdrozenie Workera'
    Write-Host '  Pierwszy raz? Utworzy sie publiczny adres *.workers.dev z cala strona.' -ForegroundColor DarkGray
    npx wrangler deploy
    if ($LASTEXITCODE -ne 0) { Write-Host '  deploy padl' -ForegroundColor Red; exit 1 }
  }

  Write-Head 'Sekrety'
  # A missing Worker is an expected state here, so the error is swallowed and read
  # from the text rather than allowed to bubble up as a failure.
  $listing = (npx wrangler secret list 2>&1 | Out-String)
  if ($listing -match 'not found' -or $listing -match 'ERROR') {
    Write-Host '  Worker jeszcze nie istnieje w Cloudflare.' -ForegroundColor Red
    Write-Host '  Pierwsze wdrozenie tworzy go: uruchom ten skrypt bez -CheckOnly.' -ForegroundColor DarkGray
    exit 0
  }

  $missing = @()
  foreach ($group in @(@{ Items = $required; Label = 'WYMAGANE' }, @{ Items = $optional; Label = 'opcjonalne' })) {
    Write-Host ''
    Write-Host "  $($group.Label):"
    foreach ($secret in $group.Items) {
      $isSet = $listing -match [regex]::Escape($secret.Name)
      $mark = if ($isSet) { 'JEST ' } else { 'BRAK ' }
      $colour = if ($isSet) { 'Green' } elseif ($group.Label -eq 'WYMAGANE') { 'Red' } else { 'DarkGray' }
      Write-Host ("    {0} {1,-22} {2}" -f $mark, $secret.Name, $secret.What) -ForegroundColor $colour
      if (-not $isSet) { $missing += $secret }
    }
  }

  if ($CheckOnly -or $missing.Count -eq 0) {
    Write-Host ''
    if ($missing.Count -eq 0) { Write-Host 'Wszystko ustawione.' -ForegroundColor Green }
    exit 0
  }

  Write-Host ''
  $answer = Read-Host "Ustawic teraz brakujace ($($missing.Count))? (y/N)"
  if ($answer -notmatch '^[yY]') {
    Write-Host 'Pominieto. Mozesz ustawic pojedynczo:' -ForegroundColor DarkGray
    foreach ($secret in $missing) { Write-Host "  npx wrangler secret put $($secret.Name)" }
    exit 0
  }

  foreach ($secret in $missing) {
    Write-Host ''
    Write-Host "--> $($secret.Name)  ($($secret.What))" -ForegroundColor Cyan
    Write-Host '    Enter na pustej wartosci = pominiecie' -ForegroundColor DarkGray
    npx wrangler secret put $secret.Name
  }

  Write-Head 'Gotowe'
  Write-Host 'Sprawdz stan ponownie:'
  Write-Host '  powershell -ExecutionPolicy Bypass -File tools\deploy-worker.ps1 -CheckOnly'
} finally {
  Pop-Location
}
