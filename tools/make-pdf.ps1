<#
  Generates the two-page registration PDF, in the adult or the under-18 version.

  Usage (from the project root):
      powershell -ExecutionPolicy Bypass -File tools\make-pdf.ps1
      powershell -ExecutionPolicy Bypass -File tools\make-pdf.ps1 -Minor
      powershell -ExecutionPolicy Bypass -File tools\make-pdf.ps1 -RaceNumber 041 -FullName "Anna Kowalska"

  With no arguments it produces a sample with placeholder data, which is what you
  want when checking the layout. Page 1 is the Italian form to sign, page 2 the
  translated courtesy copy.

  -Minor switches to emails/pdf-print-minor.html and writes the file the Make
  scenario fetches for riders under 18. Both files have to exist on the deployed
  site: the scenario picks the URL from the isMinor flag, and a missing file makes
  the HTTP module return 404 and stop the branch before the mail goes out.

  This file is deliberately pure ASCII. PowerShell 5.1 reads .ps1 as ANSI unless
  the file carries a BOM, so a literal accented character breaks the parser.
#>
param(
  [switch]$Minor,

  [string]$RaceNumber = '039',
  [string]$FullName   = 'Marco Rossi',
  [string]$BirthDate  = '12.04.1994',
  [string]$PostalCode = '07028',
  [string]$Email      = 'marco.rossi@example.com',
  [string]$Phone      = '+39 333 111 2233',
  [string]$Address    = 'Via Roma 4, 07028 Santa Teresa Gallura (SS)',
  [string]$CartName   = 'Fulmine di Gallura',
  [string]$Category   = 'CLASSIC',
  [string]$Team       = 'Squadra Nord',
  [string]$CartNotes  = 'Freno a leva, ruote con cuscinetti',

  # Used only with -Minor.
  [string]$RiderAge         = '15',
  [string]$GuardianName     = 'Anna Rossi',
  [string]$GuardianRelation = 'madre',
  [string]$GuardianRelationPl = 'matka',
  [string]$GuardianEmail    = 'anna.rossi@example.com',
  [string]$GuardianPhone    = '+39 333 444 5566',
  [string]$MotherName       = 'Anna Rossi',
  [string]$FatherName       = 'Luca Rossi',

  [string]$OutFile = ''
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

if ($Minor) {
  $templatePath = 'emails/pdf-print-minor.html'
  if (-not $OutFile) { $OutFile = 'public/emails/Carruleddhi-modulo-minori.pdf' }
  # A grown-up default sample would be misleading on a minors form.
  if ($BirthDate -eq '12.04.1994') { $BirthDate = '04.03.2011' }
  if ($FullName -eq 'Marco Rossi') { $FullName = 'Sara Rossi' }
} else {
  $templatePath = 'emails/pdf-print.html'
  if (-not $OutFile) { $OutFile = 'public/emails/Carruleddhi-modulo.pdf' }
}

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { throw 'Chrome or Edge not found. Install one of them.' }

$template = [System.IO.File]::ReadAllText((Resolve-Path $templatePath), [System.Text.Encoding]::UTF8)

# POSTAL_CODE, not TAX_CODE. The templates were renamed when the form stopped
# asking for a codice fiscale, but this table was not, so {{POSTAL_CODE}} was
# never substituted and the printed form carried the literal placeholder.
$values = @{
  RACE_NUMBER  = $RaceNumber
  FULL_NAME    = $FullName
  BIRTH_DATE   = $BirthDate
  POSTAL_CODE  = $PostalCode
  EMAIL        = $Email
  PHONE        = $Phone
  ADDRESS      = $Address
  CART_NAME    = $CartName
  CATEGORY     = $Category
  TEAM         = $Team
  CART_NOTES   = $CartNotes
  GENERATED_AT = (Get-Date -Format 'dd.MM.yyyy HH:mm')

  RIDER_AGE             = $RiderAge
  GUARDIAN_NAME         = $GuardianName
  GUARDIAN_RELATION     = $GuardianRelation
  GUARDIAN_RELATION_PL  = $GuardianRelationPl
  GUARDIAN_EMAIL        = $GuardianEmail
  GUARDIAN_PHONE        = $GuardianPhone
  MOTHER_NAME           = $MotherName
  FATHER_NAME           = $FatherName
}
foreach ($key in $values.Keys) {
  $template = $template.Replace('{{' + $key + '}}', $values[$key])
}

# Anything still wearing braces was never given a value, which on a form that has
# to be signed would print as literal "{{SOMETHING}}". Fail loudly instead.
$leftover = [regex]::Matches($template, '\{\{[A-Z_]+\}\}') |
  ForEach-Object { $_.Value } |
  Sort-Object -Unique
if ($leftover.Count -gt 0) {
  throw ('Unreplaced placeholders in ' + $templatePath + ': ' + ($leftover -join ', '))
}

$temp = Join-Path $env:TEMP ('carruleddhi-pdf-' + [guid]::NewGuid().ToString('N') + '.html')
[System.IO.File]::WriteAllText($temp, $template, $utf8)

$out = Join-Path (Get-Location) $OutFile
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null

# Chrome reports success on stderr ("N bytes written"), which PowerShell turns
# into an error record. Start-Process keeps that out of the error stream.
$chromeArgs = @(
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
  '--print-to-pdf-no-header', "--print-to-pdf=$out",
  "--user-data-dir=$env:TEMP\carruleddhi-pdf-profile",
  ('file:///' + $temp.Replace('\', '/'))
)
Start-Process -FilePath $chrome -ArgumentList $chromeArgs -Wait -NoNewWindow | Out-Null

Remove-Item $temp -ErrorAction SilentlyContinue

if (Test-Path $out) {
  $size = [Math]::Round((Get-Item $out).Length / 1KB, 1)
  "OK  $OutFile  ($size kB)"
} else {
  throw "Failed to generate $OutFile"
}
