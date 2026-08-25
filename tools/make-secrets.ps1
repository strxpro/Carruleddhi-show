# Carruleddhi - generates the secrets and prints a paste-ready block for Vercel.
#
# WHAT IT DOES
#   Three of the six environment variables are passwords nobody should invent by
#   hand: a salt, an admin passphrase and the gate password. This makes them from a
#   cryptographic random source, writes them to .env.local (git-ignored) so they are
#   not lost, and prints the block to paste into Vercel.
#
#   The other three are yours to fetch: two from Supabase, one from Make. The script
#   asks for them and puts them in the same block, so there is one thing to copy
#   rather than six things to remember.
#
# USAGE
#   powershell -ExecutionPolicy Bypass -File tools\make-secrets.ps1
#   powershell -ExecutionPolicy Bypass -File tools\make-secrets.ps1 -Show
#
# This file is pure ASCII on purpose: PowerShell 5.1 reads .ps1 as ANSI without a
# byte order mark, so a literal accented character breaks the parser.

[CmdletBinding()]
param(
  # Reprint what is already in .env.local instead of generating anything new.
  [switch]$Show,

  # Regenerate the three passwords even if .env.local already has them.
  # WARNING: a new ROSTER_KEY locks you out of the admin panel until you update
  # Vercel, and a new SITE_PASSWORD invalidates the one you gave people.
  [switch]$Rotate
)

$ErrorActionPreference = 'Stop'
$envFile = Join-Path (Get-Location) '.env.local'
$utf8 = New-Object System.Text.UTF8Encoding($false)

# Seven variables, in the order they are entered in Vercel.
$order = @(
  'SITE_PASSWORD',
  # Unlocks the admin panel's interface. Compiled into the bundle, so it guards the
  # layout and nothing else - the passphrase protecting participant data is ROSTER_KEY,
  # which stays in Vercel's environment and is checked by the function on every request.
  'VITE_ADMIN_PASSWORD',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'WALL_SALT',
  'ROSTER_KEY',
  'MAKE_WEBHOOK_URL'
)

function Read-EnvFile {
  $map = [ordered]@{}
  if (-not (Test-Path $envFile)) { return $map }
  foreach ($line in [System.IO.File]::ReadAllLines($envFile)) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $i = $line.IndexOf('=')
    $map[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1).Trim()
  }
  return $map
}

# Random, from the OS source. Alphanumeric only: these get pasted into web forms,
# read off a phone screen and typed by hand, and a shell-special character in a
# password is a support call waiting to happen.
function New-Secret {
  param([int]$Length = 40)
  $alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  $bytes = New-Object 'byte[]' $Length
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}

$values = Read-EnvFile

if ($Show) {
  if ($values.Count -eq 0) { Write-Host 'Nothing stored yet. Run without -Show first.' -ForegroundColor Yellow; exit 1 }
} else {
  # --- the three generated ones -------------------------------------------------
  # Short and typeable for the gate: it is shared with people, not a root key.
  # Long for the other two: they are pasted once and never typed.
  $generated = @{ SITE_PASSWORD = 14; VITE_ADMIN_PASSWORD = 14; WALL_SALT = 44; ROSTER_KEY = 28 }
  foreach ($name in $generated.Keys) {
    if ($Rotate -or -not $values[$name]) { $values[$name] = New-Secret -Length $generated[$name] }
  }

  # --- the three you fetch -------------------------------------------------------
  Write-Host ''
  Write-Host '=== Three values I cannot generate ===' -ForegroundColor Yellow
  Write-Host 'Leave blank to keep what is already stored.' -ForegroundColor DarkGray
  Write-Host ''

  $prompts = [ordered]@{
    SUPABASE_URL         = 'Supabase > Settings > API > Project URL   (https://xxxx.supabase.co)'
    SUPABASE_SERVICE_KEY = 'Supabase > Settings > API > service_role   (the long one UNDER anon)'
    MAKE_WEBHOOK_URL     = 'Make > scenario 1 > module 1 > Webhook URL'
  }
  foreach ($name in $prompts.Keys) {
    $current = $values[$name]
    $hint = if ($current) { ' [stored: ' + $current.Substring(0, [Math]::Min(18, $current.Length)) + '...]' } else { '' }
    Write-Host $prompts[$name] -ForegroundColor Cyan
    $answer = Read-Host ("  $name$hint")
    if ($answer.Trim()) { $values[$name] = $answer.Trim() }
  }

  # Cheap sanity checks. A service_role key pasted into SUPABASE_URL is the single
  # most likely mistake here and produces an error nowhere near its cause.
  if ($values['SUPABASE_URL'] -and $values['SUPABASE_URL'] -notmatch '^https://[a-z0-9-]+\.supabase\.co/?$') {
    Write-Host '  ! SUPABASE_URL does not look like https://xxxx.supabase.co' -ForegroundColor Red
  }
  if ($values['SUPABASE_SERVICE_KEY'] -and $values['SUPABASE_SERVICE_KEY'].Length -lt 40) {
    Write-Host '  ! SUPABASE_SERVICE_KEY looks too short. Did you copy the anon key?' -ForegroundColor Red
  }
  if ($values['MAKE_WEBHOOK_URL'] -and $values['MAKE_WEBHOOK_URL'] -notmatch '^https://hook\.[a-z0-9]+\.make\.com/') {
    Write-Host '  ! MAKE_WEBHOOK_URL should start https://hook.eu1.make.com/' -ForegroundColor Red
  }

  $lines = @(
    '# Carruleddhi Show 2026 - environment variables.',
    '# Generated by tools\make-secrets.ps1. Git-ignored: never commit this file.',
    '# These are the same values that belong in Vercel > Settings > Environment Variables.',
    ''
  )
  foreach ($name in $order) { $lines += ('{0}={1}' -f $name, $values[$name]) }
  [System.IO.File]::WriteAllLines($envFile, $lines, $utf8)
  Write-Host ''
  Write-Host "Saved to .env.local" -ForegroundColor Green
}

Write-Host ''
Write-Host '==================== PASTE INTO VERCEL ====================' -ForegroundColor Yellow
Write-Host 'Project > Settings > Environment Variables > paste as .env' -ForegroundColor DarkGray
Write-Host ''
foreach ($name in $order) {
  if (-not $values[$name]) { Write-Host ("{0}=   <<< MISSING" -f $name) -ForegroundColor Red; continue }
  Write-Host ('{0}={1}' -f $name, $values[$name])
}
Write-Host ''
Write-Host '==========================================================' -ForegroundColor Yellow
Write-Host ''
Write-Host 'Write these two down somewhere that is not this machine:' -ForegroundColor Cyan
Write-Host ("  SITE_PASSWORD  {0}   <- the password you give people" -f $values['SITE_PASSWORD'])
Write-Host ("  ROSTER_KEY     {0}   <- admin panel, section 08" -f $values['ROSTER_KEY'])
Write-Host ''
Write-Host 'After pasting into Vercel: Deployments > latest > Redeploy.' -ForegroundColor DarkGray
Write-Host 'Variables are read at build time, so an existing deployment will not see them.' -ForegroundColor DarkGray
