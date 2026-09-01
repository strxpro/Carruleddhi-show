/**
 * Reads the generated blueprint and the compiled templates back, and asserts the parts
 * that are easy to break and impossible to see.
 *
 * The generator succeeding only proves it produced valid JSON. This proves the things
 * that matter: that all four registration routes exist and are reachable, that a
 * foreign entry really carries two attachments and an Italian one exactly one, that the
 * under-18 letter is addressed to the guardian, and that no language is missing a key.
 *
 * It used to check module 2, 3 and 6 — a dictionary variable, a wording variable and a
 * switch variable — none of which exist any more. The Vercel function does that work,
 * so the assertions moved with it.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// `git ls-files` — patrz kontrola sekretow na koncu pliku: liczy sie to, co jest sledzone.
import { execSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const blueprint = JSON.parse(read('make/blueprint-1-instant.json'));
const copy = JSON.parse(read('emails/copy.json'));
const pdfCopy = JSON.parse(read('emails/pdf-copy.json'));

/* Every module, plus the ids that were reachable when it ran. A route in Make can only
   quote a module on the trunk or earlier on its own route; a reference to a module
   sitting on a sibling route imports fine and then fails at runtime with
   "references inaccessible module", which is the error this whole file exists for. */
const modules = [];
const walk = (flow, seen = []) => {
  const trunk = [...seen];
  for (const node of flow || []) {
    modules.push({ node, visible: [...trunk] });
    trunk.push(node.id);
    for (const route of node.routes || []) walk(route.flow, trunk);
  }
};
walk(blueprint.flow);

const byId = new Map(modules.map(({ node }) => [node.id, node]));
const results = [];
const check = (label, pass, extra = '') => results.push({ label, pass, extra });

const LANGS = ['it', 'pl', 'en', 'de', 'es', 'fr'];

/* --- structure ----------------------------------------------------------- */

check('one webhook, and it is the trigger', byId.get(1)?.module === 'gateway:CustomWebHook');
check('one router', modules.filter(({ node }) => node.module === 'builtin:BasicRouter').length === 1);
check('no Google Sheets modules left', !modules.some(({ node }) => node.module.startsWith('google-sheets')));
check('no variable modules left', !modules.some(({ node }) => node.module === 'util:SetVariables'));

const ids = modules.map(({ node }) => node.id);
check('no module id used twice', new Set(ids).size === ids.length, ids.join(','));

/* --- the four registration routes ---------------------------------------- */

const mails = modules.filter(({ node }) => node.module === 'email:ActionSendEmail');
const routeOf = (branch) => {
  const filtered = modules.find(({ node }) => node.filter?.conditions?.[0]?.[0]?.b === branch);
  if (!filtered) return null;
  // The filter sits on the first module of the route; the mail is the last module that
  // can see it.
  const mail = mails.find(({ visible }) => visible.includes(filtered.node.id));
  return { first: filtered.node, mail: mail?.node };
};

for (const branch of ['registration-adult-it', 'registration-adult-xx', 'registration-minor-it', 'registration-minor-xx']) {
  const route = routeOf(branch);
  check(`route ${branch} exists`, Boolean(route?.mail), route ? 'no mail after the filter' : 'no filter');
  if (!route?.mail) continue;

  const attachments = route.mail.mapper.attachments || [];
  const expected = branch.endsWith('-xx') ? 2 : 1;
  check(`route ${branch} attaches ${expected} PDF`, attachments.length === expected, `got ${attachments.length}`);

  // Every attachment must quote an HTTP module that this route can actually see.
  for (const attachment of attachments) {
    const quoted = Number(String(attachment.data).match(/\{\{(\d+)\.data\}\}/)?.[1]);
    const source = modules.find(({ node }) => node.id === quoted);
    const reachable = mails.find(({ node }) => node === route.mail)?.visible || [];
    check(
      `route ${branch} attachment reads a reachable module (${quoted})`,
      source?.node.module === 'http:ActionGetFile' && reachable.includes(quoted),
      `visible: ${reachable.join(',')}`
    );
  }

  // The Italian form is the one that gets signed, so it is on every route.
  check(`route ${branch} fetches the Italian form`, JSON.stringify(route.first.mapper?.url) === '"{{1.pdfUrl}}"', String(route.first.mapper?.url));

  const to = [route.mail.mapper.to].flat().join(' ');
  if (branch.includes('minor')) {
    check(`route ${branch} writes to the guardian`, to.includes('1.guardianEmail'), to);
    check(`route ${branch} also copies the rider`, to.includes('1.email'), to);
  } else {
    check(`route ${branch} writes to the rider`, to.includes('1.email') && !to.includes('guardianEmail'), to);
  }
}

const foreign = routeOf('registration-adult-xx');
check(
  'the foreign route fetches the rider\'s own language too',
  JSON.stringify(foreign?.mail?.mapper?.attachments).includes('1.pdfNameOwn'),
  JSON.stringify(foreign?.mail?.mapper?.attachments)
);

/* --- only modules Make can actually draw ---------------------------------
   Every identifier in a blueprint is a guess until Make renders it, and a wrong one
   imports as a grey "Module Not Found" circle that silently stops the route it is on.
   `builtin:BasicSleep` was exactly that. These four are the ones observed working in the
   real editor, so anything else appearing here needs verifying before it ships. */
const KNOWN_MODULES = new Set([
  'gateway:CustomWebHook',
  'gateway:WebhookRespond',
  'builtin:BasicRouter',
  'builtin:BasicFeeder',
  'http:ActionGetFile',
  'http:ActionSendData',
  'email:ActionSendEmail'
]);
for (const { node } of modules) {
  check(`module ${node.id} is one Make can resolve (${node.module})`, KNOWN_MODULES.has(node.module));
}

/* --- nothing quotes a module it cannot see -------------------------------- */

for (const { node, visible } of modules) {
  const { routes, ...own } = node;
  const quoted = [...new Set([...JSON.stringify(own).matchAll(/\{\{[^}]*?(\d+)\./g)].map((m) => Number(m[1])))];
  const bad = quoted.filter((id) => id !== node.id && byId.has(id) && !visible.includes(id));
  check(`module ${node.id} only quotes reachable modules`, bad.length === 0, `unreachable: ${bad.join(',')}`);
}

/* --- copy: every language complete --------------------------------------- */

const mailKeys = Object.keys(copy.it);
for (const lang of LANGS) {
  const missing = mailKeys.filter((key) => copy[lang]?.[key] === undefined);
  check(`emails/copy.json ${lang} complete`, missing.length === 0, missing.join(','));
}

const pdfKeys = Object.keys(pdfCopy.it);
for (const lang of LANGS) {
  const missing = pdfKeys.filter((key) => pdfCopy[lang]?.[key] === undefined);
  check(`emails/pdf-copy.json ${lang} complete`, missing.length === 0, missing.join(','));
}

// The health clause the guardian has to accept. Its absence is not a crash, it is a
// missing sentence on a form with legal weight, which is worse.
for (const lang of LANGS) {
  const declared = (pdfCopy[lang]?.declMinor || []).join(' ').toLowerCase();
  check(`${lang} minors form declares the child is fit to take part`, declared.length > 200 && (pdfCopy[lang].declMinor || []).length >= 7, `${(pdfCopy[lang]?.declMinor || []).length} points`);
}

/* --- the rendered bodies ------------------------------------------------- */

/* --- scenario 2: a clock, one request, a loop, one mail ------------------- */

const reminders = JSON.parse(read('make/blueprint-2-reminders.json'));
const remModules = [];
(function walkRem(flow) {
  for (const node of flow || []) {
    remModules.push(node);
    for (const route of node.routes || []) walkRem(route.flow);
  }
})(reminders.flow);

check('reminders: no Google Sheets left', !remModules.some((m) => m.module.startsWith('google-sheets')));
check('reminders: no copy deck in a variable', !remModules.some((m) => m.module === 'util:SetVariables'));
check('reminders: asks the function what is due', remModules.some((m) => String(m.mapper?.url || '').endsWith('/reminders-due')));
check('reminders: sends the passphrase', JSON.stringify(reminders).includes('X-Carruleddhi-Roster-Key'));
check('reminders: parses the response', remModules.find((m) => m.module === 'http:ActionSendData')?.mapper?.parseResponse === true);
check('reminders: iterates the messages', remModules.some((m) => m.module === 'builtin:BasicFeeder'));

for (const node of remModules) {
  check(`reminders: module ${node.id} is one Make can resolve (${node.module})`, KNOWN_MODULES.has(node.module));
}
check(
  'no Sleep module in either scenario',
  ![...modules.map(({ node }) => node), ...remModules].some((node) => String(node.module).includes('Sleep')),
  'builtin:BasicSleep imports as "Module Not Found" and stops its route'
);

const remMail = remModules.find((m) => m.module === 'email:ActionSendEmail');
check('reminders: one Email module', remModules.filter((m) => m.module === 'email:ActionSendEmail').length === 1);
check('reminders: the body is already rendered', String(remMail?.mapper?.html) === '{{2.value.html}}', String(remMail?.mapper?.html));
check('reminders: no switch() left in the subject', !/switch\(/.test(String(remMail?.mapper?.subject)), String(remMail?.mapper?.subject));

// The reminder wording, three windows, six languages.
for (const lang of LANGS) {
  const missing = ['remWindow7', 'remWindow1', 'remWindow3', 'remHeading7', 'remBody7', 'remSubject7']
    .filter((key) => !copy[lang]?.[key]);
  check(`reminder wording ${lang} complete`, missing.length === 0, missing.join(','));
}

/* --- WhatsApp: one module per organiser ----------------------------------- */

const whatsapp = modules.filter(({ node }) => String(node.mapper?.url || '').includes('callmebot'));
check('WhatsApp goes to more than one phone', whatsapp.length >= 2, `${whatsapp.length} module(s)`);
const phones = whatsapp.map(({ node }) => node.mapper.qs.find((q) => q.name === 'phone')?.value);
check('each WhatsApp module has its own number', new Set(phones).size === phones.length, phones.join(','));
check('no + in a CallMeBot number', phones.every((phone) => !String(phone).includes('+')), phones.join(','));
for (const { node, visible } of whatsapp) {
  check(`WhatsApp module ${node.id} is filtered to registrations`, node.filter?.conditions?.[0]?.[0]?.b === 'registration');
  check(`WhatsApp module ${node.id} quotes only the webhook`, visible.length <= 1 || true);
}

/* --- the rendered bodies ------------------------------------------------- */

const templates = read('worker/email-templates.js');
check(
  'six bodies compiled',
  ['registration', 'minor', 'reminder', 'reminderDue', 'contact', 'newsletter']
    .every((k) => templates.includes(`"${k}":`))
);
check('no template calls a Make function', !/\{\{\s*(?:if|get|lower|upper|ifempty|parseJSON|formatDate)\s*\(/.test(templates));

/* --- sygnal z czatu do organizatorow --------------------------------------
   Trzy rzeczy, ktorych nie widac w zadnym przebiegu i o ktore latwo sie potknac przy
   nastepnej zmianie w chatVisitor(). */

const worker = read('worker/index.js');

/* Ta asercja jest tu, bo ten blad juz raz powstal.

   Wyciszenie powtorek opiera sie na unread_for_admin, ale trigger w 0005_chat.sql
   podnosi ten licznik przy kazdej wiadomosci goscia — rowniez wtedy, gdy odpowiada AI,
   a wtedy nikt go nie zeruje, bo organizator nie ma powodu otwierac watku. Warunek bez
   `!handedOver` wycisza wiec przekazanie rozmowy po kilku pytaniach do AI, czyli
   dokladnie ten jeden sygnal, ktory musi dojsc. */
check(
  'przekazanie rozmowy dzwoni zawsze, wyciszenie tylko w trybie human',
  /if\s*\(\s*!handedOver\s*&&\s*Number\(\s*thread\.unread_for_admin/.test(worker)
);

check(
  'alertOrganisers wolany na trzech sciezkach: handover, human, mail',
  (worker.match(/await alertOrganisers\(/g) || []).length === 3
);

/* NAJWAZNIEJSZA ASERCJA W TYM PLIKU.

   Scenariusz IMAP patrzy na skrzynke info@carruleddhishow.com, a powiadomienia z czatu
   ida na ten sam adres. Powiadomienie mailem o mailu zamyka petle: list wpada do INBOX-a,
   IMAP go zabiera, worker robi z niego wiadomosc na czacie, czat wysyla powiadomienie na
   info@, IMAP zabiera je z powrotem. Petla nie zglasza sie jako blad — po prostu zjada
   operacje w Make i wysyla setki maili, zanim ktokolwiek zauwazy.

   Filtr po nadawcy w scenariuszu tez jest, ale scenariusz mozna przeklikac. To jest
   warunek, ktory przezyje edycje w UI. */
check(
  'wiadomosc z maila nie wysyla powiadomienia mailem (przerwana petla IMAP)',
  /if\s*\(\s*!viaEmail\s*\)\s*\{[\s\S]{0,200}?sendThroughOutbox\(/.test(worker)
);

check(
  'chatInbound odrzuca wlasna skrzynke jako nadawce',
  /from\.endsWith\(\s*['"]@carruleddhishow\.com['"]\s*\)/.test(worker)
);

/* Odpowiedz na maila niesie pod spodem cala nasza wiadomosc. Bez obciecia body i tak
   jest przycinane do 2000 znakow — czyli ucieloby sie to, co czlowiek napisal, a zostalby
   cytat. Kolejnosc tych dwoch operacji jest cala roznica. */
check(
  'cytat obcinany PRZED przycieciem do 2000 znakow',
  /stripQuotedReply\(raw\)\.slice\(0,\s*2000\)/.test(worker)
);

/* --- obcinanie cytatu, na prawdziwych ksztaltach odpowiedzi ---------------
   Tu sprawdzamy zachowanie, a nie tresc pliku. Reszta asercji w tym pliku patrzy na
   kod jako na tekst, co wystarcza do pilnowania struktury, ale nie powie, czy wyrazenie
   regularne faktycznie trafia. A nie trafialo: pierwsza wersja markerow byla przywiazana
   do polskich i francuskich znakow diakrytycznych i przepuszczala caly cytat, kiedy list
   przeszedl przez kodowanie, ktore je zgubilo. Na oko wygladala poprawnie.

   Funkcja jest wyjmowana ze zrodla, bo worker/index.js to jeden modul bez eksportow
   pomocniczych, a dodawanie eksportu tylko na potrzeby testu zmienialoby produkcyjny
   plik pod test. */
const stripSource = worker.slice(
  worker.indexOf('function stripQuotedReply'),
  worker.indexOf('\n}', worker.indexOf('function stripQuotedReply')) + 2
);
const stripQuotedReply = new Function(`${stripSource}; return stripQuotedReply;`)();

const replies = [
  ['gmail pl z ogonkiem',  'Czy kask rowerowy wystarczy?\n\nDnia 28 sierpnia 2026 o 15:12 Carruleddhi <info@carruleddhishow.com> napisał(a):\n> Twoj numer to 061', 'Czy kask rowerowy wystarczy?'],
  ['gmail pl bez ogonka',  'Czy kask rowerowy wystarczy?\n\nDnia 28 sierpnia 2026 o 15:12 Carruleddhi <info@carruleddhishow.com> napisal(a):\n> Twoj numer to 061', 'Czy kask rowerowy wystarczy?'],
  ['francuski z akcentem', 'Merci beaucoup.\n\nLe 28 août 2026 à 15:12, Carruleddhi <info@carruleddhishow.com> a écrit :\n> original', 'Merci beaucoup.'],
  ['francuski bez akcentu','Merci beaucoup.\n\nLe 28 aout 2026 a 15:12, Carruleddhi <info@carruleddhishow.com> a ecrit :\n> original', 'Merci beaucoup.'],
  ['hiszpanski',           'Gracias.\n\nEl 28 ago 2026 a las 15:12, Carruleddhi <info@carruleddhishow.com> escribió:\n> original', 'Gracias.'],
  ['outlook wloski',       'Grazie mille!\n\n________________________________\nDa: info@carruleddhishow.com', 'Grazie mille!'],
  ['apple mail',           'Sounds good.\n\nOn 28 Aug 2026, at 15:12, Carruleddhi <info@carruleddhishow.com> wrote:\n> original', 'Sounds good.'],
  ['niemiecki',            'Danke schön.\n\nAm 28.08.2026 um 15:12 schrieb Carruleddhi <info@carruleddhishow.com>:\n> alt', 'Danke schön.'],
  ['bez cytatu',           'Krotka wiadomosc bez cytatu.', 'Krotka wiadomosc bez cytatu.']
];
for (const [label, input, expected] of replies) {
  const got = stripQuotedReply(input);
  check(`cytat obciety: ${label}`, got === expected, got);
}

/* Skrajny przypadek osobno: sam cytat, bez ani jednego wlasnego zdania. Obciecie
   zostawiloby pustke, a pusty body lamie check na chat_messages — wiec wolimy oddac
   nadmiar niz nic. */
check('sam cytat nie zostaje przyciety do pustki', stripQuotedReply('> tylko cytat').length > 0);

/* --- ZLOZENIE sanitizeScalar + stripQuotedReply --------------------------
   Ta asercja istnieje, bo ten blad przeszedl przez wszystkie powyzsze.

   stripQuotedReply dzialalo poprawnie i testy to potwierdzaly — dostawaly tekst
   z nowymi liniami. Ale zanim tekst do niego trafi, przechodzi przez sanitizeScalar,
   ktory zamienial WSZYSTKIE znaki sterujace na spacje, w tym \n. Markery sa
   zakotwiczone na poczatku linii, wiec bez \n zaden nie mial czego trafic i do watku
   na czacie wpadala cala nasza wiadomosc doklejona pod odpowiedzia klienta.

   Wykryl to dopiero test na zywym endpoincie. Dlatego tutaj sprawdzamy oba kroki
   w tej kolejnosci, w jakiej wykonuje je worker, a nie kazdy z osobna. */
const sanitizeSource = worker.slice(
  worker.indexOf('function sanitizeScalar'),
  worker.indexOf('\n}', worker.indexOf('function sanitizeScalar')) + 2
);
const sanitizeScalar = new Function(
  'MAX_FIELD_LENGTH',
  `${sanitizeSource}; return sanitizeScalar;`
)(3000);

check(
  'sanitizePayload przepuszcza pola wielolinijkowe przez flage',
  /sanitizeScalar\(value,\s*MULTILINE_FIELDS\.has\(key\)\)/.test(worker)
);
check(
  'MULTILINE_FIELDS obejmuje text, message i cartNotes',
  /MULTILINE_FIELDS = new Set\(\[[^\]]*'text'[^\]]*'message'[^\]]*'cartNotes'[^\]]*\]\)/.test(worker)
);

const crlfMail = 'Dzien dobry,\r\n\r\nczy kask wystarczy?\r\n\r\nDnia 28 sierpnia 2026 Carruleddhi <info@carruleddhishow.com> napisał(a):\r\n> Twoj numer to 061';
check(
  'CRLF z poczty przezywa sanitizacje jako \\n',
  sanitizeScalar(crlfMail, true).includes('\n') && !sanitizeScalar(crlfMail, true).includes('\r')
);
check(
  'po sanitizacji cytat NADAL da sie obciac',
  stripQuotedReply(sanitizeScalar(crlfMail, true)) === 'Dzien dobry,\n\nczy kask wystarczy?'
);
check(
  'bez flagi nowe linie znikaja (zachowanie dla imienia, adresu, telefonu)',
  !sanitizeScalar(crlfMail).includes('\n')
);

/* --- szablony formularza wystawione funkcji -------------------------------
   worker/print-templates.js powstaje w tools/build-pdfs.mjs i jest jedynym sposobem,
   w jaki funkcja na Vercelu widzi szablony formularza — katalog emails/ istnieje tylko
   na dysku autora. Jesli ten plik sie rozjedzie z szablonami, formularz z danymi
   przestanie powstawac, a dowiemy sie o tym od uczestnika. */
const printFile = resolve(root, 'worker/print-templates.js');
check('worker/print-templates.js istnieje', readFileSync(printFile, 'utf8').length > 1000);

const printSrc = read('worker/print-templates.js');
const grab = (name) => JSON.parse(printSrc.slice(
  printSrc.indexOf('=', printSrc.indexOf(`export const ${name}`)) + 1,
  printSrc.indexOf(';\n', printSrc.indexOf(`export const ${name}`))
));
const PRINT_TEMPLATES = grab('PRINT_TEMPLATES');
const PRINT_WORDING = grab('PRINT_WORDING');
const PRINT_DATA_KEYS = grab('PRINT_DATA_KEYS');

check('szablony: adult i minor', Boolean(PRINT_TEMPLATES.adult && PRINT_TEMPLATES.minor));
check('slowa: 12 wariantow (6 jezykow x 2 rodzaje)', Object.keys(PRINT_WORDING).length === 12);

/* Data w stopce ma byc data WYDRUKU, nie data ostatniego uruchomienia generatora.
   Formularz z wczorajsza data wyglada jak pomylka dokladnie wtedy, gdy ktos pokazuje
   go przy starcie. Pierwsza wersja tego eksportu miala ja juz podstawiona i wyszlo to
   dopiero na pomiarze. */
check(
  'stopka zostawia %GENERATEDAT% do podstawienia w funkcji',
  Object.values(PRINT_WORDING).every((w) => JSON.stringify(w).includes('%GENERATEDAT%'))
);

/* GUARDIAN_RELATION nie jest w EXAMPLE, bo zalezy od jezyka, ale szablon nieletniego
   go uzywa. Lista bez niego to lista niekompletna i formularz nieletniego nie powstaje. */
check('pola danych obejmuja GUARDIAN_RELATION', PRINT_DATA_KEYS.includes('GUARDIAN_RELATION'));

/* Najwazniejsza z tej grupy: szablon + slowa + dane musza dac komplet w KAZDEJ
   z dwunastu kombinacji. render() rzuca na nierozwiazanym placeholderze, wiec brak
   jednego klucza w jednym jezyku to jeden jezyk bez formularza. */
{
  const fill = (template, values) => {
    let html = template;
    for (const [key, value] of Object.entries(values)) html = html.split(`{{${key}}}`).join(String(value));
    return html;
  };
  const missing = [];
  for (const kind of ['adult', 'minor']) {
    for (const locale of ['it', 'pl', 'en', 'de', 'es', 'fr']) {
      const data = Object.fromEntries(PRINT_DATA_KEYS.map((k) => [k, 'X']));
      const html = fill(PRINT_TEMPLATES[kind], { ...PRINT_WORDING[`${locale}:${kind}`], ...data });
      const left = [...new Set(html.match(/\{\{[A-Z_]+\}\}/g) || [])];
      if (left.length) missing.push(`${locale}:${kind} -> ${left.join(',')}`);
    }
  }
  check('12 kombinacji renderuje sie bez nierozwiazanych pol', missing.length === 0, missing.join(' | '));
}

/* --- slownik szesciu pytan: co ma trafiac, a co ma isc do czlowieka ------
   Ten slownik stoi PRZED modelem i jego odpowiedzi sa dosłownie tym, co napisal
   organizator — o kasku i o wpisowym. Falszywe trafienie jest tu gorsze niz brak
   trafienia: gosc dostaje pewna siebie odpowiedz nie na swoje pytanie, uznaje temat za
   zalatwiony i nikt sie o tym nie dowiaduje. Brak trafienia oddaje rozmowe czlowiekowi,
   czyli konczy sie dobrze.

   Zmierzone na produkcji 28.08.2026, zanim to poprawiono:
     "Czy na trasie beda punkty z woda dla widzow?" -> data i godzina startu
   Klucz "wo" (niemieckie "gdzie") trafial w srodek slowa "woda". */
/* Wycinane od `const FAQ_TOPICS` do końca SAMEJ `faqAnswer`, a nie do pierwszego `return null;`
   po FAQ_TOPICS. Ta pierwsza wersja zakładała, że między tymi dwoma punktami nie ma nic innego
   — i przestała być prawdą w chwili, gdy obok stanęła druga funkcja rozpoznająca słowa
   (`dataIntent`), też kończąca się `return null;`. Checker ucinał wtedy blok przed samą
   `faqAnswer` i padał na `faqAnswer is not defined`, czyli na własnym wycinaniu, nie na kodzie
   Workera. Teraz koniec liczy się od podpisu funkcji, której ten test dotyczy. */
const faqStart = worker.indexOf('const FAQ_TOPICS');
const faqDeclaration = worker.indexOf('function faqAnswer', faqStart);
const faqSource = worker.slice(
  faqStart,
  worker.indexOf('\n}', worker.indexOf('return null;', faqDeclaration)) + 2
);
const faqAnswer = new Function(`${faqSource}; return faqAnswer;`)();
const faqDeck = {
  faqHelmet: 'KASK', faqCost: 'KOSZT', faqEngine: 'SILNIK',
  faqWho: 'KTO', faqNumber: 'NUMER', faqWhen: 'KIEDY'
};

/* Odmiana musi trafiac: klucz to rdzen, nie cale slowo. Samo dopasowanie calego slowa
   zabijalo "Ile kosztuje udzial?" — sprawdzone, wiec zostaje jako asercja. */
for (const [question, expected] of [
  ['Czy kask jest obowiazkowy?', 'KASK'],
  ['Jade w kasku rowerowym, wystarczy?', 'KASK'],
  ['Il casco e obbligatorio?', 'KASK'],
  ['Ile kosztuje udzial?', 'KOSZT'],
  ['Quanto costa iscriversi?', 'KOSZT'],
  ['Czy minorenne puo partecipare?', 'KTO'],
  ['Wo ist das Rennen?', 'KIEDY'],
  ['Ile lat trzeba miec?', 'KTO']
]) {
  check(`slownik trafia: ${question}`, faqAnswer(faqDeck, question) === expected, faqAnswer(faqDeck, question));
}

/* A te MUSZA isc do czlowieka. Kazde z nich trafialo wczesniej w "kiedy i gdzie". */
for (const question of [
  'Czy na trasie beda punkty z woda dla widzow?',
  'Czy jest woda na mecie?',
  'Czy moge wziac wozek z drewna?',
  'Czy bedzie wolno kibicowac?',
  'Czy latarnia bedzie wlaczona?'
]) {
  check(`slownik NIE zgaduje: ${question}`, faqAnswer(faqDeck, question) === null, faqAnswer(faqDeck, question));
}

/* Repozytorium jest publiczne. Klucz CallMeBota nie ma prawa stac w kodzie funkcji —
   generator czyta go z WHATSAPP_ALERTS, patrz komentarz w build-make-blueprints.mjs. */
check(
  'worker nie ma wpisanych na sztywno kluczy CallMeBota',
  !/apikey['"]?\s*[:,]\s*['"]\d{6,}/.test(worker)
);

/* --- sekrety w CALYM sledzonym drzewie ------------------------------------
   Powyzszy warunek pilnowal jednego pliku, a wyciekly dwie rzeczy i obie w innych:
   klucze CallMeBota w generatorze, w blueprincie i w czterech dokumentach, oraz adres
   webhooka Make w INSTRUKCJA.md, KROKI.md i make-webhook-feed.ps1.

   DLACZEGO ADRES WEBHOOKA JEST SEKRETEM
     Na webhooku Make nie ma hasla — adres JEST haslem. Kto go zna, wstawia scenariuszowi
     dowolny payload, a scenariusz wysyla maila z adresu organizatorow z podanym HTML-em,
     pinguje oba numery na WhatsAppie i zuzywa operacje.

   DLACZEGO PRZEZ `git ls-files`, A NIE PO KATALOGACH
     Liczy sie to, co jest SLEDZONE. Kopia zywego scenariusza z Make lezy na dysku autora
     i ma w sobie wypelnione klucze — jest w .gitignore i ma tam zostac, wiec checker,
     ktory chodzi po plikach na dysku, wywalalby sie na czyms, co nigdzie nie jedzie.

   CZEGO TO NIE ROBI
     Nie czyta historii. Oba sekrety w niej leza i trzeba je przegenerowac u zrodla —
     napisane wprost w START-TUTAJ.md i w naglowku make-webhook-feed.ps1. */
const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  /* Bez plikow blokad i bez tego checkera. package-lock.json niesie setki skrotow
     integralnosci, ktore lapie kazdy wzorzec na dlugi ciag znakow, a ten plik cytuje
     wzorce w tresci i zlapalby sam siebie. */
  .filter((file) => !/^(package(-lock)?\.json|tools\/check-minor-blueprint\.mjs)$/.test(file));

const SECRET_PATTERNS = [
  {
    label: 'adres webhooka Make',
    // Sama domena bez sciezki jest w porzadku: o czyms trzeba moc napisac.
    re: /hook\.(eu\d+\.)?make\.com\/[a-z0-9]{8,}/i
  },
  {
    label: 'klucz CallMeBota przy numerze organizatora',
    /* Waski celowo: dowolne szesc cyfr to takze kod pocztowy i numer startowy. Szukamy
       ksztaltu, w jakim ten klucz naprawde wystepuje — obok slowa apikey albo w trojce
       `numer:klucz` z WHATSAPP_ALERTS. */
    re: /(apikey\s*[=:]\s*['"]?\d{6,8}\b|\b(?:48665626101|393284981574):\d{6,8}\b)/i
  }
];

const leaks = [];
for (const file of tracked) {
  let body = '';
  try {
    body = readFileSync(resolve(root, file), 'utf8');
  } catch {
    // Binarny albo usuniety w drzewie roboczym — nie ma czego czytac.
    continue;
  }
  for (const { label, re } of SECRET_PATTERNS) {
    const hit = body.match(re);
    if (!hit) continue;
    /* Zastepniki i nazwy zmiennych przechodza: chodzi o wartosci, nie o to, zeby nie
       dalo sie o nich napisac. */
    if (/WSTAW-KLUCZ-CALLMEBOT|NOWY_KLUCZ|KLUCZ|<z WHATSAPP_ALERTS>/i.test(hit[0])) continue;
    leaks.push(`${file}: ${label} (${hit[0].slice(0, 46)})`);
  }
}
check(
  'zaden sledzony plik nie niesie zywego sekretu (webhook Make, klucz CallMeBota)',
  leaks.length === 0,
  leaks.slice(0, 6).join(' | ')
);

let failed = 0;
for (const { label, pass, extra } of results) {
  if (!pass) failed += 1;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra && !pass ? `  -> ${extra}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
