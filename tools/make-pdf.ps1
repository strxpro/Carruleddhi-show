<#
  Kept as a shortcut. The real generator is tools\build-pdfs.mjs.

  It used to build two PDFs, both Italian inside, by filling this file's own table of
  sample values into a two-page template. That stopped being the right shape when the
  forms went to six languages: there are twelve files now, the wording lives in
  emails\pdf-copy.json, and the personal fields are left blank because one file is
  served to every rider.

  Usage (from the project root):
      powershell -ExecutionPolicy Bypass -File tools\make-pdf.ps1
      powershell -ExecutionPolicy Bypass -File tools\make-pdf.ps1 -Sample

  -Sample fills the layout with example data instead of writing lines. Useful for
  checking how a long address wraps; never for a file that gets mailed out.
#>
param([switch]$Sample)

$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  if ($Sample) { node tools/build-pdfs.mjs --sample } else { node tools/build-pdfs.mjs }
  if ($LASTEXITCODE -ne 0) { throw "build-pdfs.mjs exited with $LASTEXITCODE" }
} finally {
  Pop-Location
}
