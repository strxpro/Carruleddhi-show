/**
 * Panel „ten adres jest już zapisany" — czy wchodzi w drogę na czas i czy pozwala przejść.
 *
 *     node tools/probe-entry.mjs http://127.0.0.1:4173
 *
 * PO CO
 *   Ten panel ma dwa zachowania i oba są równie ważne. Ma się pokazać, kiedy adres jest
 *   w bazie — i ma NIE pokazywać się, kiedy nie jest, ani kiedy sprawdzenie się nie udało.
 *   Druga połowa jest tą, która może zablokować zapisy komukolwiek, a w podglądzie backendu
 *   nie ma, więc każde zapytanie tu zawodzi. To znaczy, że ten przebieg mierzy dokładnie
 *   najgorszy przypadek: czy przy niedostępnym API formularz nadal przechodzi z kroku 1
 *   do kroku 2.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4173';

function chromePath() {
  const candidates = [
    join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe')
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('Nie znalazłem Chrome ani Edge.');
  return found;
}

const probe = `
<script>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { errors: [] };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));
  await sleep(2400);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);

  const form = document.querySelector('[data-registration-form]');
  const panel = document.querySelector('[data-entry-found]');
  if (!form || !panel) {
    out.errors.push('brak formularza albo panelu');
  } else {
    out.markup = {
      panelPresent: true,
      hiddenAtStart: panel.hidden,
      choices: [...panel.querySelectorAll('[data-entry-action]')].map((b) => b.dataset.entryAction),
      hasCodeStep: Boolean(panel.querySelector('[data-entry-code-step]')),
      hasEditStep: Boolean(panel.querySelector('[data-entry-edit-step]')),
      // Pola, ktore wolno zmieniac samemu. Imienia, nazwiska i daty urodzenia ma tu NIE byc.
      editable: [...panel.querySelectorAll('[data-entry-edit-step] input, [data-entry-edit-step] textarea')]
        .map((f) => f.id)
    };

    // Etykiety musza byc przetlumaczone, nie zostac wloskimi napisami z HTML.
    out.labels = {
      title: panel.querySelector('[data-i18n="entry.foundTitle"]')?.textContent.trim() || '',
      other: panel.querySelector('[data-entry-action="other"]')?.textContent.trim() || '',
      withdraw: panel.querySelector('[data-entry-action="withdraw"]')?.textContent.trim() || ''
    };

    /* --- najwazniejsze: formularz musi przejsc dalej, gdy sprawdzenie zawodzi.
       W podgladzie endpoint nie odpowiada, wiec to jest ten przypadek. */
    document.getElementById('signup')?.scrollIntoView();
    await sleep(300);
    const fill = (name, value) => {
      const field = form.elements.namedItem(name);
      if (field) { field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    fill('firstName', 'Marco');
    fill('lastName', 'Rossi');
    fill('birthDate', '1990-05-05');
    fill('postalCode', '07028');
    fill('email', 'ktos@example.com');
    fill('phone', '+39 333 111 222');
    fill('address', 'Via Verdi 1');

    const next = form.querySelector('[data-form-next]');
    const stepBefore = document.querySelector('[data-form-shell]')?.dataset.formActive || '';
    next?.click();
    // Zapytanie musi sie odbic i przycisk wrocic do stanu uzywalnego.
    await sleep(1800);
    out.lookupFails = {
      stepBefore,
      stepAfter: document.querySelector('[data-form-shell]')?.dataset.formActive || '',
      panelShown: !panel.hidden,
      buttonDisabled: Boolean(next?.disabled),
      buttonLabel: next?.textContent.trim() || ''
    };

    /* --- wspolny e-mail: najpierw osoba, dopiero potem kod dla jej entryId. */
    document.querySelector('[data-form-step="2"] [data-form-back]')?.click();
    await sleep(250);
    let codePayload = null;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      if (url.includes('/entry-lookup')) {
        return new Response(JSON.stringify({
          ok: true,
          exists: true,
          entries: [
            { id: '11111111-1111-4111-8111-111111111111', initials: 'MR', raceNumber: '007', withdrawn: false, minor: false },
            { id: '22222222-2222-4222-8222-222222222222', initials: 'AR', raceNumber: '014', withdrawn: false, minor: false }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/entry-code')) {
        codePayload = JSON.parse(init?.body || '{}');
        return new Response(JSON.stringify({ ok: true, email: 'k***@example.com' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(input, init);
    };
    fill('email', 'rodzina@example.com');
    next?.click();
    await sleep(700);
    const people = [...panel.querySelectorAll('[data-entry-person]')];
    const edit = panel.querySelector('[data-entry-action="edit"]');
    const disabledBefore = Boolean(edit?.disabled);
    people[1]?.click();
    const disabledAfter = Boolean(edit?.disabled);
    edit?.click();
    await sleep(500);
    out.multiple = {
      count: people.length,
      labels: people.map((person) => person.textContent.trim()),
      disabledBefore,
      disabledAfter,
      selected: people[1]?.getAttribute('aria-pressed') || '',
      codeEntryId: codePayload?.entryId || ''
    };

    /* --- ta sama osoba, nie tylko ta sama skrzynka.
       Panel ma wtedy powiedzieć co innego i podstawić inny przycisk. Sprawdzane przez
       policzony display, a nie przez sam atrybut hidden: hidden daje display:none z arkusza
       przeglądarki i przegrywa z każdą własną regułą display, a oba przełączane elementy
       takie reguły dostają — akapit jest gridem, a span siedzi w przycisku. */
    document.querySelector('[data-form-step="2"] [data-form-back]')?.click();
    await sleep(250);
    const shown = (element) => Boolean(element)
      && getComputedStyle(element).display !== 'none'
      && element.offsetParent !== null;

    window.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      if (url.includes('/entry-lookup')) {
        const sent = JSON.parse(init?.body || '{}');
        return new Response(JSON.stringify({
          ok: true,
          exists: true,
          duplicate: true,
          duplicateId: '22222222-2222-4222-8222-222222222222',
          entries: [
            { id: '11111111-1111-4111-8111-111111111111', initials: 'AR', raceNumber: '007', withdrawn: false, minor: false, samePerson: false },
            { id: '22222222-2222-4222-8222-222222222222', initials: 'MR', raceNumber: '014', withdrawn: false, minor: false, samePerson: true }
          ],
          echo: sent
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };

    let sentToLookup = null;
    const lookupSpy = window.fetch;
    window.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : input?.url || '');
      if (url.includes('/entry-lookup')) sentToLookup = JSON.parse(init?.body || '{}');
      return lookupSpy(input, init);
    };

    fill('email', 'imiennik@example.com');
    next?.click();
    await sleep(700);
    const samePill = panel.querySelector('[data-entry-person][data-entry-id="22222222-2222-4222-8222-222222222222"]');
    out.duplicate = {
      // Czy imię i nazwisko wyszły w zapytaniu. Bez nich serwer nie ma czego porównać.
      sentFirstName: sentToLookup?.firstName || '',
      sentLastName: sentToLookup?.lastName || '',
      addressLeadShown: shown(panel.querySelector('[data-entry-lead="address"]')),
      personLeadShown: shown(panel.querySelector('[data-entry-lead="person"]')),
      personLeadText: panel.querySelector('[data-entry-lead="person"]')?.textContent.trim().slice(0, 40) || '',
      otherLabelAddressShown: shown(panel.querySelector('[data-entry-other-label="address"]')),
      otherLabelPersonShown: shown(panel.querySelector('[data-entry-other-label="person"]')),
      panelMarked: panel.classList.contains('is-same-person'),
      samePillMarked: Boolean(samePill?.classList.contains('is-same')),
      // Trafiona osoba ma być wybrana od razu, żeby „popraw" nie celowało w brata.
      samePillSelected: samePill?.getAttribute('aria-pressed') || '',
      badges: [...panel.querySelectorAll('.entry-person__same')].length
    };

    /* --- i wyjście: „to inna osoba" musi przepuścić dalej. */
    panel.querySelector('[data-entry-action="other"]')?.click();
    await sleep(500);
    out.duplicate.stepAfterOverride = document.querySelector('[data-form-shell]')?.dataset.formActive || '';
    out.duplicate.panelHiddenAfterOverride = panel.hidden;

    window.fetch = originalFetch;
  }

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-entry-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedział ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__entryprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    '--virtual-time-budget=40000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__entryprobe.html?skipIntro=1`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Sonda nie wystartowała. Pierwsze 400 znaków:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  const r = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

  let fails = 0;
  const check = (pass, line) => { if (!pass) fails += 1; console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`); };

  console.log(`błędy JS: ${r.errors.length ? r.errors.join(' | ') : 'brak'}\n`);

  if (r.markup) {
    const m = r.markup;
    check(m.hiddenAtStart === true, 'panel ukryty na start');
    check(m.choices.join(',') === 'other,edit,withdraw', `trzy wyjścia: ${m.choices.join(', ')}`);
    check(m.hasCodeStep && m.hasEditStep, 'krok z kodem i krok edycji obecne');
    const forbidden = m.editable.filter((id) => /name$|first|last|birth/i.test(id) && id !== 'entry-cart' && id !== 'entry-team');
    check(forbidden.length === 0,
      `nie da się samemu zmienić danych z podpisanego formularza (pola: ${m.editable.join(', ')})`);
  }

  if (r.labels) {
    console.log('');
    check(r.labels.title.length > 0 && r.labels.other.length > 0,
      `etykiety przetłumaczone: „${r.labels.title}" / „${r.labels.other}" / „${r.labels.withdraw}"`);
  }

  if (r.lookupFails) {
    const f = r.lookupFails;
    console.log('');
    check(f.stepAfter === '2',
      `przy niedostępnym API formularz idzie dalej: krok ${f.stepBefore} → ${f.stepAfter}`);
    check(f.panelShown === false, 'panel nie wyskakuje bez powodu');
    check(f.buttonDisabled === false, `przycisk odblokowany po zapytaniu (napis „${f.buttonLabel}")`);
  }

  if (r.multiple) {
    console.log('');
    check(r.multiple.count === 2, `dwie osoby renderują dwie pastylki: ${r.multiple.labels.join(' / ')}`);
    check(r.multiple.disabledBefore && !r.multiple.disabledAfter && r.multiple.selected === 'true',
      'edycja jest zablokowana do wyboru konkretnej osoby');
    check(r.multiple.codeEntryId === '22222222-2222-4222-8222-222222222222',
      `kod wysłany dla wybranej osoby: ${r.multiple.codeEntryId}`);
  }

  if (r.duplicate) {
    const d = r.duplicate;
    console.log('');
    check(d.sentFirstName === 'Marco' && d.sentLastName === 'Rossi',
      `imię i nazwisko jadą do sprawdzenia: „${d.sentFirstName} ${d.sentLastName}"`);
    check(d.personLeadShown && !d.addressLeadShown,
      `panel mówi o osobie, nie o adresie: „${d.personLeadText}…"`);
    check(d.otherLabelPersonShown && !d.otherLabelAddressShown,
      'przycisk wyjścia mówi „to inna osoba", nie „zapisuję kolejną"');
    check(d.panelMarked && d.samePillMarked && d.badges === 1,
      `wyróżniona jest dokładnie jedna osoba (plakietek: ${d.badges})`);
    check(d.samePillSelected === 'true', 'trafiona osoba wybrana od razu, bez dodatkowego pytania');
    check(d.stepAfterOverride === '2' && d.panelHiddenAfterOverride,
      `„to inna osoba" przepuszcza dalej: krok → ${d.stepAfterOverride}`);
  }

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
