# Carruleddhi - feed the Make webhook with sample data.
#
# WHAT IT IS FOR
#   In Make, a webhook does not know what fields to expect until it has actually
#   received some. While the module shows "Listening for data", run this script:
#   it posts one message per branch with every field filled in, so Make learns the
#   whole structure at once and all fields become mappable in later modules.
#
# HOW TO USE
#   1. In Make open scenario 1, click module 1 (Webhooks).
#   2. Leave the "Listening for data" panel open.
#   3. Run:   powershell -ExecutionPolicy Bypass -File tools\make-webhook-feed.ps1
#   4. The panel flips to "Successfully determined". Click OK, then Save.
#
# WHY THE ODD [char] CONSTANTS BELOW
#   PowerShell 5.1 reads .ps1 files as ANSI when there is no byte order mark, so a
#   literal Polish or Italian letter typed into this file would arrive at Make as
#   mojibake and the test would prove nothing. Building those few characters from
#   code points keeps this file pure ASCII and the payload correct on every
#   PowerShell version.
#
# NOTE ON SAFETY
#   These are made-up people. Do not point this at a production scenario that is
#   switched ON unless you want four real e-mails and a WhatsApp message.

# WHY THE WEBHOOK URL IS NOT WRITTEN IN THIS FILE ANY MORE
#   It used to be the default value of -WebhookUrl. That URL is a bare capability:
#   anybody who has it can POST whatever they like into scenario 1, which sends
#   e-mail from the organisers' address with the HTML it was handed, pings both
#   organisers on WhatsApp and burns Make operations. There is no password on a
#   Make webhook - the address IS the password.
#
#   This repository is public, so the address stopped being a secret the moment it
#   was committed. It now comes from MAKE_WEBHOOK_URL: the environment, or
#   .env.local, which is covered by .gitignore. Same variable the Worker uses, so
#   there is one place to change it.
#
#   Removing it from the file does NOT remove it from git history. Regenerate the
#   hook in Make (module 1 -> Redetermine data structure gives a new address),
#   then update MAKE_WEBHOOK_URL in Vercel and in .env.local.

[CmdletBinding()]
param(
  # Scenario 1 webhook ("ZAPISY NA WYSCIG"). Read from MAKE_WEBHOOK_URL when left
  # empty - see the note above. Pass -WebhookUrl to aim somewhere else once.
  [string]$WebhookUrl = '',

  # Send through the Cloudflare Worker instead of straight to Make. Use this for
  # the real end-to-end test once the Worker is deployed; the Worker validates,
  # rate limits and forces the type from the URL path.
  [string]$WorkerBase = '',

  # Skip the confirmation prompt.
  [switch]$Force,

  # Print what would be sent and where, without sending anything. Use this to
  # check the target URL after changing the hook, so a live scenario does not
  # fire real e-mails just to confirm a setting.
  [switch]$DryRun,

  # Also send one realistic message per branch, so each route can be watched running
  # end to end. The combined teaching message is sent first either way - see the note
  # above $unionPayload - so this switch is safe to use whether the webhook is still
  # learning or the scenario is already ON.
  [switch]$All
)

# --- where to send -----------------------------------------------------------
# Order: -WebhookUrl, then the environment, then .env.local. A missing address is a
# hard stop with the fix spelled out, not a silent POST to nowhere: this script's
# whole job is to make Make learn a structure, and a 404 teaches it nothing.
if (-not $WebhookUrl) { $WebhookUrl = $env:MAKE_WEBHOOK_URL }
if (-not $WebhookUrl) {
  $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env.local'
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
      if ($line -match '^\s*MAKE_WEBHOOK_URL\s*=\s*(.+?)\s*$') {
        $WebhookUrl = $matches[1].Trim("'", '"')
        break
      }
    }
  }
}
if (-not $WebhookUrl -and -not $WorkerBase) {
  Write-Host 'Nie znam adresu webhooka.' -ForegroundColor Red
  Write-Host '  Ustaw MAKE_WEBHOOK_URL w .env.local (ten sam adres, co w Vercelu),' -ForegroundColor DarkGray
  Write-Host '  albo podaj go raz: -WebhookUrl https://hook.eu1.make.com/...' -ForegroundColor DarkGray
  Write-Host '  Adres nie jest juz wpisany w tym pliku - repozytorium jest publiczne.' -ForegroundColor DarkGray
  exit 1
}

$ErrorActionPreference = 'Stop'

# Accented characters assembled from code points - see the note in the header.
$aOgonek  = [char]0x0105   # a with ogonek
$zDot     = [char]0x017C   # z with dot above
$eGrave   = [char]0x00E8   # e grave
$sAcute   = [char]0x015B   # s acute
$lStroke  = [char]0x0142   # l with stroke
$oAcute   = [char]0x00F3   # o acute

$polishNote = "Drewniana rama, ko$($lStroke)a z $($lStroke)o$($zDot)yskami, hamulec no$($zDot)ny. Test znak$($oAcute)w: $aOgonek$zDot$sAcute $eGrave"

$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

# Unique suffix per run.
#
#   registrations, reminder_subscribers and newsletter_subscribers each have a unique
#   index on email (0002_event_data.sql, lines 71/137/161). Fixed test addresses meant
#   the first run stored them and every run after it was refused as a duplicate - four
#   of five messages coming back 502, with contact_messages the only table without such
#   an index and so the only one that kept working.
#
#   A duplicate is now answered properly by the API (409, "already registered"), which
#   is right for a real visitor and useless for a test that wants to exercise the happy
#   path. So the addresses change every run.
#   And the local parts differ per message, not only per run. They were all
#   "test.registration+<run>", so the teaching message stored that address and the
#   adult one right after it was refused as a duplicate of itself:
#
#     23505  Key (lower(email))=(test.registration+0825032241@example.com) already exists
#
#   union / adult / minor / reminder / contact each have their own now.
$run = (Get-Date).ToString('MMddHHmmss')

# One message carrying every field of all four branches.
#
# WHY THIS EXISTS
#   Make closes the "Listening for data" session as soon as it has determined a
#   structure from the first request. The next two then arrive at a webhook whose
#   scenario is switched off and come back as HTTP 410 Gone, which is exactly what
#   happened: 1 of 3 delivered. One request with the union of every field teaches
#   Make everything in a single hit, and 20+ fields become mappable at once.
#
#   Send this first. The three realistic per-type messages below are for testing
#   the scenario end to end afterwards, with -All, once it is switched ON.
$unionPayload = [ordered]@{
  type          = 'registration'
  event         = 'Carruleddhi Show 2026'
  eventDate     = '2026-10-17T14:30:00+02:00'
  locale        = 'pl'
  source        = 'powershell-feed'
  submittedAt   = $stamp
  # registration
  firstName     = 'Marek'
  lastName      = 'Testowy'
  birthDate     = '1994-03-18'
  postalCode    = '07028'
  email         = "test.union+$run@example.com"
  phone         = '+48 600 100 200'
  address       = 'Via Giuseppe Verdi 12, Santa Teresa Gallura (SS)'
  cartName      = 'Bolide Rosso'
  category      = 'classic'
  teamName      = 'Team Testowy'
  cartNotes     = $polishNote
  rulesConsent  = $true
  privacyConsent= $true
  newsConsent   = $true
  # Under-18 riders.
  #
  # THESE WERE MISSING AND THAT WAS THE BUG.
  #   The blueprint maps ten guardian fields into columns W..AF and branches the
  #   whole e-mail on `isMinor`. None of them were in this payload, so the webhook
  #   never learned they exist and Make drew every one of those mappings with a red
  #   outline - "no such field" - while the module error badge counted seven of
  #   them. The sheet row went in with ten blank columns and the minor branch could
  #   never fire.
  #
  #   They belong in the union message even though a real adult entry omits them:
  #   this message exists to teach Make the shape of every possible request, not to
  #   look like a plausible one. Compare validate() in worker/index.js, which
  #   strips the guardian block off adult entries on the way through.
  isMinor          = $true
  riderAge         = '14'
  childKind        = 'daughter'
  guardianRelation = 'mother'
  guardianName     = 'Anna Testowa'
  guardianEmail    = "test.guardian+$run@example.com"
  guardianPhone    = '+48 600 300 400'
  motherName       = 'Anna Testowa'
  fatherName       = 'Piotr Testowy'
  guardianConsent  = $true
  # reminder
  name             = 'Giulia Prova'
  consent          = $true
  reminderSchedule = '7d,1d,3h'
  # contact
  message       = 'Wiadomosc testowa z formularza kontaktowego.'
  # Added by the Vercel function, not by the browser.
  #
  #   raceNumber comes from the Postgres sequence, so it exists before Make is
  #   called. Make used to count spreadsheet rows to work it out; now it reads
  #   {{1.raceNumber}}.
  #
  #   branch is "registration-adult", "registration-minor", "reminder" or "contact",
  #   decided from the age the function computed from the birth date. Every filter in
  #   the scenario is one text comparison against it, which is why there is no AND
  #   anywhere and no nested router.
  #
  # Both must be in this message. The webhook only learns fields it has actually
  # received, so leaving them out is how {{1.branch}} ends up unresolved and every
  # route filters everything out.
  raceNumber    = '001'
  branch        = 'registration-minor'
}

$payloads = [ordered]@{
  'registration' = [ordered]@{
    type          = 'registration'
    event         = 'Carruleddhi Show 2026'
    eventDate     = '2026-10-17T14:30:00+02:00'
    locale        = 'pl'
    source        = 'powershell-feed'
    submittedAt   = $stamp
    firstName     = 'Marek'
    lastName      = 'Testowy'
    birthDate     = '1994-03-18'
    postalCode    = '07028'
    email         = "test.adult+$run@example.com"
    phone         = '+48 600 100 200'
    address       = "Via Giuseppe Verdi 12, 07028 Santa Teresa Gallura (SS)"
    cartName      = 'Bolide Rosso'
    category      = 'classic'
    teamName      = 'Team Testowy'
    cartNotes     = $polishNote
    rulesConsent  = $true
    privacyConsent= $true
    newsConsent   = $true
    # Sent on an adult entry too, and false on purpose. The site always sends both
    # (see registrationData in app.js) because a flag that only appears for minors
    # would leave the adult branch inferring from an absence.
    isMinor       = $false
    riderAge      = '32'
    raceNumber    = '001'
    branch        = 'registration-adult'
  }

  # A rider who is 14 on the day of the race. This is the branch that decides who
  # the e-mail is addressed to, which PDF is attached and whose signature the
  # organisers will be looking for at the start, so it gets its own end-to-end run
  # rather than being trusted because the adult one worked.
  #
  # The label is not the request type - see the loop at the bottom, which reads the
  # type out of the payload. Two entries here are registrations and a hashtable
  # cannot hold the same key twice.
  'registration - minor' = [ordered]@{
    type             = 'registration'
    event            = 'Carruleddhi Show 2026'
    eventDate        = '2026-10-17T14:30:00+02:00'
    locale           = 'pl'
    source           = 'powershell-feed-minor'
    submittedAt      = $stamp
    firstName        = 'Sara'
    lastName         = 'Testowa'
    birthDate        = '2012-03-04'
    postalCode       = '07028'
    email            = "test.minor+$run@example.com"
    phone            = '+48 600 500 600'
    address          = 'Via Giuseppe Verdi 12, 07028 Santa Teresa Gallura (SS)'
    cartName         = 'Piccola Freccia'
    category         = 'art'
    teamName         = ''
    cartNotes        = ''
    rulesConsent     = $true
    privacyConsent   = $true
    newsConsent      = $false
    isMinor          = $true
    riderAge         = '14'
    childKind        = 'daughter'
    guardianRelation = 'mother'
    guardianName     = 'Anna Testowa'
    guardianEmail    = "test.guardian+$run@example.com"
    guardianPhone    = '+48 600 300 400'
    motherName       = 'Anna Testowa'
    fatherName       = 'Piotr Testowy'
    guardianConsent  = $true
    raceNumber       = '002'
    branch           = 'registration-minor'
  }

  'reminder' = [ordered]@{
    type             = 'reminder'
    event            = 'Carruleddhi Show 2026'
    eventDate        = '2026-10-17T14:30:00+02:00'
    locale           = 'it'
    source           = 'powershell-feed'
    submittedAt      = $stamp
    name             = 'Giulia Prova'
    email            = "test.reminder+$run@example.com"
    consent          = $true
    reminderSchedule = '7d,1d,3h'
    branch           = 'reminder'
  }

  'contact' = [ordered]@{
    type        = 'contact'
    event       = 'Carruleddhi Show 2026'
    eventDate   = '2026-10-17T14:30:00+02:00'
    locale      = 'de'
    source      = 'powershell-feed'
    submittedAt = $stamp
    name        = 'Hans Probe'
    email       = "test.contact+$run@example.com"
    message     = "Frage zum Helm. Test der Sonderzeichen: $aOgonek $eGrave"
    branch      = 'contact'
  }

  # ---------------------------------------------------------------- Nagroda publicznosci
  #
  #   Oba listy nizej sklada worker z bloku jezykowego (emails/copy.json), wiec payload
  #   musi ten blok niesc - inaczej modul w Make dostanie puste sciezki i wysle list bez
  #   naglowka. Tutaj jest przyciety do kluczy, ktore czytaja szablony modulow 32 i 33;
  #   worker wysyla caly blok, ale do sprawdzenia trasy tyle wystarczy.
  #
  #   Adresy sa na @example.com i nie ma ich w zadnej tabeli - test nie dotyka nikogo
  #   prawdziwego. Zadna z tych wiadomosci nie zapisuje sie tez do bazy: gałąź w Make
  #   tylko wysyła e-mail, a stan glosowania zmienia panel, nie webhook.

  'voting-winner (podium)' = [ordered]@{
    type            = 'voting-winner'
    branch          = 'voting-winner'
    locale          = 'pl'
    email           = "test.winner+$run@example.com"
    name            = 'Marco Rossi'
    place           = 1
    category        = 'classic'
    startNumber     = 41
    projectName     = 'Fulmine di Gallura'
    participantName = 'Marco Rossi'
    totalScore      = 268
    voteCount       = 34
    averageScore    = 7.88
    # Pola, ktore worker rozstrzyga przed wyslaniem - patrz votingAdminWinners().
    hi              = 'Cze&#347;&#263; Marco,'
    winSubject      = 'Wygrywasz Nagrode publicznosci!'
    winHeading      = 'Pierwsze miejsce. Publicznosc wybrala Ciebie.'
    winColour       = '#ffca28'
    winProject      = 'Fulmine di Gallura'
    resultsUrl      = 'https://www.carruleddhishow.com/votazione.html'
    copy            = [ordered]@{
      winLead          = 'Nagrody publicznosci nie przyznaje jury ani stoper - glosuja ludzie.'
      winStatsTitle    = 'Twoj wynik'
      winNumberLabel   = 'Numer startowy'
      winProjectLabel  = 'Wozek'
      winCategoryLabel = 'Kategoria'
      winPointsLabel   = 'Punkty'
      winVotesLabel    = 'Glosy'
      winPickup        = 'Nagrode odbierasz u organizatorow - napisz do nas.'
      winCta           = 'Zobacz wyniki'
      askAny           = 'Pytania? Odpowiedz na tego maila.'
      askCta           = 'Napisz przez strone'
      footerNote       = 'Dostajesz tego maila, bo bierzesz udzial w Carruleddhi Show 2026.'
    }
  }

  'voting-receipt (glos oddany)' = [ordered]@{
    type            = 'voting-receipt'
    branch          = 'voting-receipt'
    locale          = 'pl'
    email           = "test.vote+$run@example.com"
    name            = 'Giulia Prova'
    category        = 'classic'
    startNumber     = 41
    projectName     = 'Fulmine di Gallura'
    participantName = 'Marco Rossi'
    score           = 9
    editUrl         = 'https://www.carruleddhishow.com/votazione.html#vote=TEST0000'
    hi              = 'Cze&#347;&#263; Giulia,'
    rcptProject     = 'Fulmine di Gallura'
    rcptUrl         = 'https://www.carruleddhishow.com/votazione.html#vote=TEST0000'
    copy            = [ordered]@{
      rcptSubject      = 'Twoj glos jest zapisany'
      rcptHeading      = 'Glos zapisany. Dzieki.'
      rcptLead         = 'Nagrode publicznosci rozstrzygacie wy, glos po glosie.'
      rcptVoteTitle    = 'Twoj glos'
      rcptScoreLabel   = 'Ocena'
      rcptChange       = 'Glos mozesz poprawic tylko raz.'
      rcptResults      = 'Wyniki wysylamy zaraz po zamknieciu glosowania.'
      rcptCta          = 'Otworz strone glosowania'
      winNumberLabel   = 'Numer startowy'
      winProjectLabel  = 'Wozek'
      winCategoryLabel = 'Kategoria'
      askAny           = 'Pytania? Odpowiedz na tego maila.'
      askCta           = 'Napisz przez strone'
      footerNote       = 'Dostajesz tego maila, bo zaglosowales na stronie Carruleddhi Show 2026.'
    }
  }
}

function Send-Payload {
  param([string]$Name, $Data, [string]$Url)

  # Explicit UTF-8 bytes rather than a string body: PowerShell 5.1 otherwise
  # picks its own encoding and the diacritics arrive broken.
  $json  = $Data | ConvertTo-Json -Depth 6 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

  Write-Host ''
  Write-Host "--> $Name  ($($bytes.Length) B)" -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host "    DRY RUN, nothing sent" -ForegroundColor DarkGray
    Write-Host "    POST $Url"
    Write-Host "    fields: $((@($Data.Keys) -join ', '))"
    return $true
  }
  try {
    $response = Invoke-WebRequest -Uri $Url -Method Post -Body $bytes `
      -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 30
    $body = $response.Content
    if ($body.Length -gt 200) { $body = $body.Substring(0, 200) + '...' }
    Write-Host "    HTTP $($response.StatusCode)  $body" -ForegroundColor Green
    return $true
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = $_.Exception.Response.StatusCode.value__ }
    Write-Host "    FAILED  HTTP $code  $($_.Exception.Message.Split([char]10)[0])" -ForegroundColor Red
    # The body of a failed response is where the actual reason lives - the API puts
    # Make's own error text in `reason`, and a bad gateway with no explanation is
    # what sent us hunting through the scenario history by hand.
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      $body = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
      if ($body) { Write-Host "            $($body.Substring(0, [Math]::Min(400, $body.Length)))" -ForegroundColor DarkYellow }
    } catch { }
    return $false
  }
}

# The combined message always goes FIRST, with or without -All.
#
# THIS IS THE FIX FOR "22 values detected".
#   Make determines the webhook's structure from the first request it receives and
#   stops listening immediately. It does not merge later ones - a second detection
#   replaces the structure, it does not add to it.
#
#   So running with -All while the webhook was listening taught Make the shape of
#   whichever message happened to be first. That was the adult registration: 22
#   fields, none of them the ten guardian fields. Every mapping that quoted
#   1.guardianName came up red, and the module error badge counted them.
#
#   Putting the union first removes the trap. Whatever else is sent afterwards, the
#   structure Make keeps is the one with all 34 fields in it. The cost when the
#   scenario is already ON is one extra test e-mail, which is a fair trade for a
#   switch that cannot be used at the wrong moment any more.
$ordered = [ordered]@{ 'wszystkie pola razem (nauka struktury)' = $unionPayload }
if ($All) { foreach ($k in $payloads.Keys) { $ordered[$k] = $payloads[$k] } }
$payloads = $ordered

Write-Host ''
Write-Host '=== Carruleddhi - feeding the Make webhook ===' -ForegroundColor Yellow
if ($WorkerBase) {
  Write-Host "Target: Cloudflare Worker $WorkerBase/api/carruleddhi/<type>"
} else {
  Write-Host "Target: $WebhookUrl"
}
Write-Host ("Sending {0} message(s): {1}" -f $payloads.Count, ($payloads.Keys -join ', '))
if (-not $WorkerBase) {
  Write-Host ''
  Write-Host 'NOTE: sending straight to Make.' -ForegroundColor Yellow
  Write-Host '  The scenario now reads fields the Vercel function adds - copy, subject, hi,' -ForegroundColor DarkGray
  Write-Host '  minHi, pdfUrl and a dozen more - and this script cannot invent them: they are' -ForegroundColor DarkGray
  Write-Host '  resolved from emails/copy.json in the function itself.' -ForegroundColor DarkGray
  Write-Host '  To teach the webhook its real structure, run through the deployed site:' -ForegroundColor DarkGray
  Write-Host '    -WorkerBase "https://your-project.vercel.app"' -ForegroundColor Cyan
  Write-Host ''
}
Write-Host ("Field count of the first message: {0} - this is the number Make must show." -f $unionPayload.Count) -ForegroundColor Cyan
if ($All) {
  Write-Host 'Messages 2+ may come back as HTTP 410 if the webhook was still listening.' -ForegroundColor DarkGray
  Write-Host 'That is expected and harmless: the structure was already taught by message 1.' -ForegroundColor DarkGray
}

if ($DryRun) { Write-Host 'DRY RUN: nothing will leave this machine.' -ForegroundColor DarkGray }
elseif (-not $Force) {
  Write-Host ''
  Write-Host 'Make sure the Webhooks module is open and says "Listening for data".' -ForegroundColor Yellow
  Write-Host 'If the scenario is switched ON, this will send real e-mails.' -ForegroundColor Yellow
  $answer = Read-Host 'Continue? (y/N)'
  if ($answer -notmatch '^[yY]') { Write-Host 'Aborted.'; exit 1 }
}

$ok = 0
foreach ($name in $payloads.Keys) {
  # The path segment comes from the payload, not from the label. The Worker forces
  # the type from the URL, so a label like "registration - minor" or "wszystkie pola
  # razem" as a path would be rejected as UNKNOWN_TYPE - which it used to be.
  $type = $payloads[$name].type
  $url = if ($WorkerBase) { "$($WorkerBase.TrimEnd('/'))/api/carruleddhi/$type" } else { $WebhookUrl }
  if (Send-Payload -Name $name -Data $payloads[$name] -Url $url) { $ok++ }
  # Make needs a breath between requests to merge structures, and the Worker
  # rate limits at 6 requests per 10 minutes per IP.
  Start-Sleep -Milliseconds 1200
}

Write-Host ''
if ($DryRun) {
  Write-Host "Dry run finished: $ok / $($payloads.Count) payloads built, none sent." -ForegroundColor Yellow
  Write-Host 'Run again without -DryRun to feed the webhook for real.'
  exit 0
}
Write-Host "Done: $ok / $($payloads.Count) delivered." -ForegroundColor Yellow
Write-Host ''
Write-Host 'Next in Make:' -ForegroundColor Yellow
if ($WorkerBase) {
  Write-Host '  1. The Webhooks panel should now list the fields the function adds:'
  Write-Host '     copy, subject, hi, minHi, pdfUrl, branch, raceNumber, loc.'
  Write-Host '     If they are missing, click "Detect new values" and run this again.'
} else {
  Write-Host ("  1. The Webhooks panel will show {0} values - but NOT the fields the" -f $unionPayload.Count)
  Write-Host '     function adds. Rerun with -WorkerBase to teach it the real shape.'
}
Write-Host '  2. Click OK, then Save (the diskette on the bottom bar).'
Write-Host '  3. Open the clock icon at the top and read the runs. A red one names the'
Write-Host '     module that stopped it, which is the only thing worth reading here.'
Write-Host '  4. Check Supabase > Table Editor: rows in registrations,'
Write-Host '     reminder_subscribers, contact_messages, newsletter_subscribers.'
Write-Host ''
Write-Host 'A 502 from one message means the row was stored and Make refused the mail.' -ForegroundColor DarkGray
Write-Host 'The database is the store of record, so nothing is lost - fix the module and' -ForegroundColor DarkGray
Write-Host 'the row is still there.' -ForegroundColor DarkGray
