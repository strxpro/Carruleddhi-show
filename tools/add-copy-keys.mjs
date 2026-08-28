/**
 * Adds keys to emails/copy.json in every language at once.
 *
 * Six near-identical edits by hand is six chances to put the French string in the German
 * block. This writes them from one table and then re-reads the file to prove every
 * language ended up with every key, which is the check that matters.
 *
 *     node tools/add-copy-keys.mjs
 *
 * Idempotent: a key already present in a language is left alone, so it is safe to run
 * after adding a new group below.
 *
 * STRUCTURE
 *   One object per group of related strings, keyed by language, and GROUPS lists them.
 *   Not one big table per language: a group is what gets added at a time, and keeping the
 *   six translations of the same sentence next to each other is the only way to notice
 *   that one of them says something different.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'emails', 'copy.json');
const deck = JSON.parse(readFileSync(file, 'utf8'));

/* ------------------------------------------------------------- the chat's answers
   faqAnswer() in worker/index.js matches an unmistakable word — "casco", "helmet",
   "kask" — and returns one of these. Without them it returned null for everything, so
   every question went straight to a person: the automatic half of the chat existed in
   code and had nothing to say.

   Deliberately short and final. An answer that needs a second paragraph is an answer that
   should have been a person. */
const FAQ = {
  it: {
    faqWho: 'Può partecipare chi ha compiuto 18 anni, con modulo firmato e documento. I minorenni corrono con la liberatoria di un genitore o tutore.',
    faqCost: 'Niente: l’iscrizione è completamente gratuita.',
    faqEngine: 'No. Nessun motore e nessuna propulsione: si scende soltanto per gravità.',
    faqHelmet: 'Sì, il casco omologato è obbligatorio. Senza casco non si parte.',
    faqNumber: 'Il numero di partenza compare subito dopo l’iscrizione e arriva anche per e-mail, insieme al modulo in PDF.',
    faqWhen: '17 ottobre 2026, Discesa Rena Bianca a Santa Teresa Gallura. Presentazione alle 12:00, partenza alle 14:30.',
    chatHandover: 'Questa la passo agli organizzatori: ti rispondono qui, in questa chat. Se preferisci, lascia la tua e-mail.',
    chatGreeting: 'Ciao! Chiedimi quello che ti serve sulla gara. Se non lo so, passo la domanda agli organizzatori.'
  },
  pl: {
    faqWho: 'Startować może każdy, kto ma ukończone 18 lat, z podpisanym formularzem i dokumentem. Osoby niepełnoletnie — za pisemną zgodą rodzica lub opiekuna.',
    faqCost: 'Nic. Zapisy są całkowicie bezpłatne.',
    faqEngine: 'Nie. Żadnego silnika ani napędu — zjeżdża się wyłącznie siłą grawitacji.',
    faqHelmet: 'Tak, atestowany kask jest obowiązkowy. Bez kasku nie ma startu.',
    faqNumber: 'Numer startowy pokazuje się od razu po zapisaniu i przychodzi też mailem, razem z formularzem w PDF.',
    faqWhen: '17 października 2026, zjazd Rena Bianca w Santa Teresa Gallura. Prezentacja o 12:00, start o 14:30.',
    chatHandover: 'Przekazuję to organizatorom — odpiszą tutaj, w tym czacie. Jeśli chcesz, zostaw swój e-mail.',
    chatGreeting: 'Cześć! Pytaj o cokolwiek związanego z wyścigiem. Czego nie wiem, przekażę organizatorom.'
  },
  en: {
    faqWho: 'Anyone aged 18 or over, with a signed form and an ID document. Riders under 18 take part with a waiver signed by a parent or guardian.',
    faqCost: 'Nothing. Entry is completely free.',
    faqEngine: 'No. No engine and no propulsion of any kind — the descent is gravity only.',
    faqHelmet: 'Yes, an approved helmet is compulsory. No helmet, no start.',
    faqNumber: 'Your start number appears as soon as you have entered, and arrives by e-mail too, with the form as a PDF.',
    faqWhen: '17 October 2026, the Rena Bianca descent in Santa Teresa Gallura. Presentation at 12:00, start at 14:30.',
    chatHandover: 'I am passing this to the organisers — they will answer here, in this chat. Leave your e-mail if you prefer.',
    chatGreeting: 'Hello! Ask me anything about the race. What I do not know, I pass to the organisers.'
  },
  de: {
    faqWho: 'Teilnehmen kann, wer 18 Jahre alt ist, mit unterschriebenem Formular und Ausweis. Minderjährige fahren mit der Einverständniserklärung eines Elternteils oder Vormunds.',
    faqCost: 'Nichts. Die Anmeldung ist völlig kostenlos.',
    faqEngine: 'Nein. Kein Motor und kein Antrieb — es geht ausschließlich mit der Schwerkraft bergab.',
    faqHelmet: 'Ja, ein zugelassener Helm ist Pflicht. Ohne Helm kein Start.',
    faqNumber: 'Die Startnummer erscheint direkt nach der Anmeldung und kommt zusätzlich per E-Mail, mit dem Formular als PDF.',
    faqWhen: '17. Oktober 2026, Abfahrt Rena Bianca in Santa Teresa Gallura. Vorstellung um 12:00, Start um 14:30.',
    chatHandover: 'Ich gebe das an die Organisatoren weiter — sie antworten hier im Chat. Wenn du magst, lass deine E-Mail da.',
    chatGreeting: 'Hallo! Frag mich alles zum Rennen. Was ich nicht weiß, gebe ich an die Organisatoren weiter.'
  },
  es: {
    faqWho: 'Puede participar quien tenga 18 años cumplidos, con el formulario firmado y un documento. Los menores corren con la autorización de un padre, madre o tutor.',
    faqCost: 'Nada. La inscripción es completamente gratuita.',
    faqEngine: 'No. Ningún motor ni propulsión: se baja solo por gravedad.',
    faqHelmet: 'Sí, el casco homologado es obligatorio. Sin casco no se sale.',
    faqNumber: 'El número de salida aparece justo después de inscribirse y llega también por correo, con el formulario en PDF.',
    faqWhen: '17 de octubre de 2026, bajada Rena Bianca en Santa Teresa Gallura. Presentación a las 12:00, salida a las 14:30.',
    chatHandover: 'Paso esto a los organizadores: te responden aquí, en este chat. Si quieres, deja tu correo.',
    chatGreeting: '¡Hola! Pregúntame lo que quieras sobre la carrera. Lo que no sepa, lo paso a los organizadores.'
  },
  fr: {
    faqWho: 'Peut participer toute personne de 18 ans révolus, avec le formulaire signé et une pièce d’identité. Les mineurs courent avec l’autorisation d’un parent ou d’un tuteur.',
    faqCost: 'Rien. L’inscription est entièrement gratuite.',
    faqEngine: 'Non. Aucun moteur ni propulsion : la descente se fait uniquement par gravité.',
    faqHelmet: 'Oui, le casque homologué est obligatoire. Sans casque, pas de départ.',
    faqNumber: 'Le numéro de départ apparaît juste après l’inscription et arrive aussi par e-mail, avec le formulaire en PDF.',
    faqWhen: '17 octobre 2026, descente Rena Bianca à Santa Teresa Gallura. Présentation à 12:00, départ à 14:30.',
    chatHandover: 'Je transmets cela aux organisateurs — ils répondront ici, dans ce chat. Laissez votre e-mail si vous préférez.',
    chatGreeting: 'Bonjour ! Demandez-moi ce que vous voulez sur la course. Ce que je ne sais pas, je le transmets aux organisateurs.'
  }
};

/* -------------------------------------------------- turning the reminders off
   The small grey link at the foot of every subscription letter, and the wording of the
   e-mail carrying the code. %CODE% is substituted by the function, the same way
   %FIRSTNAME% already is — the renderer does no substitution of its own. */
const UNSUB = {
  it: {
    unsubFooter: 'Non voglio più questi avvisi',
    unsubSubject: 'Il tuo codice: %CODE%',
    unsubCodeTitle: 'Ecco il codice',
    unsubCodeLead: 'Inseriscilo sul sito per disattivare gli avvisi. Vale 15 minuti.',
    unsubCodeNote: 'Se non hai chiesto tu questo codice, ignora il messaggio: non cambia nulla.',
    unsubDone: 'Fatto. Non ti scriveremo più.'
  },
  pl: {
    unsubFooter: 'Nie chcę już tych powiadomień',
    unsubSubject: 'Twój kod: %CODE%',
    unsubCodeTitle: 'Oto kod',
    unsubCodeLead: 'Wpisz go na stronie, żeby wyłączyć powiadomienia. Jest ważny 15 minut.',
    unsubCodeNote: 'Jeśli to nie Ty prosiłeś o kod, zignoruj tę wiadomość — nic się nie zmieni.',
    unsubDone: 'Gotowe. Nie będziemy już pisać.'
  },
  en: {
    unsubFooter: 'I no longer want these',
    unsubSubject: 'Your code: %CODE%',
    unsubCodeTitle: 'Here is the code',
    unsubCodeLead: 'Enter it on the website to switch the reminders off. It lasts 15 minutes.',
    unsubCodeNote: 'If you did not ask for this code, ignore this message — nothing changes.',
    unsubDone: 'Done. We will not write again.'
  },
  de: {
    unsubFooter: 'Ich möchte das nicht mehr',
    unsubSubject: 'Dein Code: %CODE%',
    unsubCodeTitle: 'Hier ist der Code',
    unsubCodeLead: 'Gib ihn auf der Website ein, um die Erinnerungen abzuschalten. Er gilt 15 Minuten.',
    unsubCodeNote: 'Wenn du diesen Code nicht angefordert hast, ignoriere die Nachricht — es ändert sich nichts.',
    unsubDone: 'Erledigt. Wir schreiben nicht mehr.'
  },
  es: {
    unsubFooter: 'Ya no quiero estos avisos',
    unsubSubject: 'Tu código: %CODE%',
    unsubCodeTitle: 'Aquí tienes el código',
    unsubCodeLead: 'Escríbelo en la web para desactivar los avisos. Vale 15 minutos.',
    unsubCodeNote: 'Si no has pedido este código, ignora el mensaje: no cambia nada.',
    unsubDone: 'Hecho. No volveremos a escribir.'
  },
  fr: {
    unsubFooter: 'Je ne veux plus ces rappels',
    unsubSubject: 'Votre code : %CODE%',
    unsubCodeTitle: 'Voici le code',
    unsubCodeLead: 'Saisissez-le sur le site pour désactiver les rappels. Il est valable 15 minutes.',
    unsubCodeNote: 'Si vous n’avez pas demandé ce code, ignorez ce message : rien ne change.',
    unsubDone: 'C’est fait. Nous n’écrirons plus.'
  }
};

/* --------------------------------------------------------- when a person will reply
   Appended to chatHandover the moment a question goes to a human, so the visitor is told
   *when* rather than just *that* somebody will answer. Two variants because "they will
   reply here" means something different at 11:00 than at 23:00, and a chat that says the
   same thing at both hours is a chat that feels abandoned at one of them.

   The hours are 10:00–18:00 Europe/Rome and they live in one place: CHAT_HOURS in
   worker/index.js. These strings spell them out for the reader; if the constant moves,
   these sentences have to move with it. */
const HOURS = {
  it: {
    chatHoursNow: 'Siamo in chat adesso (10:00–18:00), quindi la risposta arriva a breve.',
    chatHoursLater: 'Adesso è fuori orario: rispondiamo dalle 10:00 alle 18:00, ora italiana. Ti scriviamo qui appena rientriamo.'
  },
  pl: {
    chatHoursNow: 'Jesteśmy teraz na czacie (10:00–18:00), więc odpowiedź przyjdzie niedługo.',
    chatHoursLater: 'Teraz jest po godzinach — odpowiadamy od 10:00 do 18:00 czasu włoskiego. Odpiszemy tutaj, jak tylko wrócimy.'
  },
  en: {
    chatHoursNow: 'We are in the chat right now (10:00–18:00), so the answer will come shortly.',
    chatHoursLater: 'It is outside our hours now — we answer between 10:00 and 18:00 Italian time. We will write here as soon as we are back.'
  },
  de: {
    chatHoursNow: 'Wir sind gerade im Chat (10:00–18:00), die Antwort kommt also bald.',
    chatHoursLater: 'Gerade ist außerhalb der Zeiten — wir antworten von 10:00 bis 18:00 italienischer Zeit. Wir schreiben hier, sobald wir zurück sind.'
  },
  es: {
    chatHoursNow: 'Estamos en el chat ahora mismo (10:00–18:00), así que la respuesta llegará pronto.',
    chatHoursLater: 'Ahora estamos fuera de horario: respondemos de 10:00 a 18:00, hora italiana. Te escribimos aquí en cuanto volvamos.'
  },
  fr: {
    chatHoursNow: 'Nous sommes sur le chat en ce moment (10:00–18:00), la réponse arrivera donc bientôt.',
    chatHoursLater: 'Nous sommes hors horaires : nous répondons de 10:00 à 18:00, heure italienne. Nous vous écrirons ici dès notre retour.'
  }
};

/* ----------------------------------------------- kod do zmiany własnego zgłoszenia
   Ten sam szablon maila co przy rezygnacji z powiadomień (EMAIL_TEMPLATES.code), inna
   treść. Osobne klucze, a nie te same z unsub, bo list mówi, po co jest kod: „wyłączamy
   powiadomienia" w mailu do kogoś, kto chce poprawić telefon, to zdanie, po którym człowiek
   przestaje ufać całej reszcie. */
const ENTRY = {
  it: {
    entrySubject: 'Il tuo codice: %CODE%',
    entryCodeTitle: 'Ecco il codice',
    entryCodeLead: 'Inseriscilo sul sito per vedere la tua iscrizione, correggerla o ritirarti. Vale 15 minuti.',
    entryCodeNote: 'Se non hai chiesto tu questo codice, ignora il messaggio: la tua iscrizione non cambia.'
  },
  pl: {
    entrySubject: 'Twój kod: %CODE%',
    entryCodeTitle: 'Oto kod',
    entryCodeLead: 'Wpisz go na stronie, żeby zobaczyć swoje zgłoszenie, poprawić je albo zrezygnować. Jest ważny 15 minut.',
    entryCodeNote: 'Jeśli to nie Ty prosiłeś o kod, zignoruj tę wiadomość — Twoje zgłoszenie się nie zmienia.'
  },
  en: {
    entrySubject: 'Your code: %CODE%',
    entryCodeTitle: 'Here is the code',
    entryCodeLead: 'Enter it on the website to see your entry, correct it or withdraw. It lasts 15 minutes.',
    entryCodeNote: 'If you did not ask for this code, ignore this message — your entry does not change.'
  },
  de: {
    entrySubject: 'Dein Code: %CODE%',
    entryCodeTitle: 'Hier ist der Code',
    entryCodeLead: 'Gib ihn auf der Website ein, um deine Anmeldung zu sehen, zu korrigieren oder zurückzuziehen. Er gilt 15 Minuten.',
    entryCodeNote: 'Wenn du diesen Code nicht angefordert hast, ignoriere die Nachricht — an deiner Anmeldung ändert sich nichts.'
  },
  es: {
    entrySubject: 'Tu código: %CODE%',
    entryCodeTitle: 'Aquí tienes el código',
    entryCodeLead: 'Escríbelo en la web para ver tu inscripción, corregirla o retirarte. Vale 15 minutos.',
    entryCodeNote: 'Si no has pedido este código, ignora el mensaje: tu inscripción no cambia.'
  },
  fr: {
    entrySubject: 'Votre code : %CODE%',
    entryCodeTitle: 'Voici le code',
    entryCodeLead: 'Saisissez-le sur le site pour voir votre inscription, la corriger ou vous retirer. Il est valable 15 minutes.',
    entryCodeNote: 'Si vous n’avez pas demandé ce code, ignorez ce message : votre inscription ne change pas.'
  }
};

/* ------------------------------------------------- rezygnacja: własny kod i pokwitowanie
   Od migracji 0018 kod do poprawiania danych i kod do rezygnacji to dwie różne rzeczy, więc
   listy też muszą być dwie. List mówiący tylko „oto kod" jest listem, po którym ktoś wpisuje
   sześć cyfr, nie wiedząc, że właśnie wypada z wyścigu.

   `quitDone*` to pokwitowanie po fakcie. Rezygnacji nie da się odkręcić ze strony, a jedynym
   jej śladem byłoby zdanie na stronie, którą człowiek zaraz zamknie — więc jeśli to nie on ją
   zgłosił, ten list jest sposobem, żeby się dowiedział, póki jest czas napisać. */
const QUIT = {
  it: {
    quitSubject: 'Codice per ritirarti: %CODE%',
    quitCodeTitle: 'Vuoi ritirarti dalla gara?',
    quitCodeLead: 'Inserisci questo codice sul sito per confermare il ritiro. Vale 15 minuti. Non serve per altro.',
    quitCodeNote: 'Se non hai chiesto tu questo codice, ignoralo: la tua iscrizione resta come è.',
    quitDoneSubject: 'Ritiro confermato — Carruleddhi Show 2026',
    quitDoneTitle: 'Ti abbiamo ritirato dalla gara',
    quitDoneLead: 'Il numero %RACENUMBER% torna disponibile e non ti mandiamo più promemoria.',
    quitDoneNote: 'Se non sei stato tu, scrivici subito a %ORGEMAIL% — si può rimettere a posto.'
  },
  pl: {
    quitSubject: 'Kod do rezygnacji: %CODE%',
    quitCodeTitle: 'Chcesz zrezygnować z wyścigu?',
    quitCodeLead: 'Wpisz ten kod na stronie, żeby potwierdzić rezygnację. Jest ważny 15 minut. Do niczego innego nie służy.',
    quitCodeNote: 'Jeśli to nie Ty prosiłeś o ten kod, zignoruj go — Twoje zgłoszenie zostaje bez zmian.',
    quitDoneSubject: 'Rezygnacja przyjęta — Carruleddhi Show 2026',
    quitDoneTitle: 'Wycofaliśmy Cię z wyścigu',
    quitDoneLead: 'Numer %RACENUMBER% wraca do puli, a przypomnień już nie wysyłamy.',
    quitDoneNote: 'Jeśli to nie Ty, napisz do nas od razu na %ORGEMAIL% — da się to odkręcić.'
  },
  en: {
    quitSubject: 'Code to withdraw: %CODE%',
    quitCodeTitle: 'Withdrawing from the race?',
    quitCodeLead: 'Enter this code on the website to confirm the withdrawal. It lasts 15 minutes and does nothing else.',
    quitCodeNote: 'If you did not ask for this code, ignore it — your entry stays as it is.',
    quitDoneSubject: 'Withdrawal confirmed — Carruleddhi Show 2026',
    quitDoneTitle: 'You are withdrawn from the race',
    quitDoneLead: 'Number %RACENUMBER% goes back into the pool and no more reminders are coming.',
    quitDoneNote: 'If this was not you, write to us straight away at %ORGEMAIL% — it can be put back.'
  },
  de: {
    quitSubject: 'Code zum Rücktritt: %CODE%',
    quitCodeTitle: 'Vom Rennen zurücktreten?',
    quitCodeLead: 'Gib diesen Code auf der Website ein, um den Rücktritt zu bestätigen. Er gilt 15 Minuten und tut nichts anderes.',
    quitCodeNote: 'Wenn du diesen Code nicht angefordert hast, ignoriere ihn — deine Anmeldung bleibt.',
    quitDoneSubject: 'Rücktritt bestätigt — Carruleddhi Show 2026',
    quitDoneTitle: 'Du bist vom Rennen zurückgetreten',
    quitDoneLead: 'Die Nummer %RACENUMBER% geht zurück in den Pool, und Erinnerungen kommen keine mehr.',
    quitDoneNote: 'Wenn das nicht du warst, schreib uns sofort an %ORGEMAIL% — das lässt sich zurücknehmen.'
  },
  es: {
    quitSubject: 'Código para retirarte: %CODE%',
    quitCodeTitle: '¿Te retiras de la carrera?',
    quitCodeLead: 'Escribe este código en la web para confirmar la retirada. Vale 15 minutos y no sirve para nada más.',
    quitCodeNote: 'Si no has pedido este código, ignóralo: tu inscripción se queda como está.',
    quitDoneSubject: 'Retirada confirmada — Carruleddhi Show 2026',
    quitDoneTitle: 'Te hemos retirado de la carrera',
    quitDoneLead: 'El dorsal %RACENUMBER% vuelve a estar disponible y no te enviamos más avisos.',
    quitDoneNote: 'Si no has sido tú, escríbenos enseguida a %ORGEMAIL%: se puede deshacer.'
  },
  fr: {
    quitSubject: 'Code pour vous retirer : %CODE%',
    quitCodeTitle: 'Vous vous retirez de la course ?',
    quitCodeLead: 'Saisissez ce code sur le site pour confirmer le retrait. Il est valable 15 minutes et ne sert à rien d’autre.',
    quitCodeNote: 'Si vous n’avez pas demandé ce code, ignorez-le : votre inscription reste telle quelle.',
    quitDoneSubject: 'Retrait confirmé — Carruleddhi Show 2026',
    quitDoneTitle: 'Vous êtes retiré de la course',
    quitDoneLead: 'Le numéro %RACENUMBER% retourne dans la réserve et nous ne vous enverrons plus de rappels.',
    quitDoneNote: 'Si ce n’était pas vous, écrivez-nous tout de suite à %ORGEMAIL% — cela peut être rétabli.'
  }
};

const GROUPS = [FAQ, UNSUB, HOURS, ENTRY, QUIT];
// (Ten plik obsługuje emails/copy.json. Klucze interfejsu strony idą przez
//  tools/add-i18n-keys.mjs — to dwa różne słowniki i mieszanie ich kończy się kluczem,
//  którego szuka przeglądarka, a jest tylko w mailach.)
const LANGS = ['it', 'pl', 'en', 'de', 'es', 'fr'];

let added = 0;
for (const group of GROUPS) {
  for (const lang of LANGS) {
    if (!deck[lang]) throw new Error(`no language block "${lang}" in emails/copy.json`);
    if (!group[lang]) throw new Error(`a group is missing its "${lang}" translations`);
    for (const [key, value] of Object.entries(group[lang])) {
      if (deck[lang][key] !== undefined) continue;
      deck[lang][key] = value;
      added += 1;
    }
  }
}

writeFileSync(file, `${JSON.stringify(deck, null, 2)}\n`, 'utf8');

/* Read back and compared against Italian. The whole point of doing this in one pass is
   that no language can be left a key short, so that is the thing to assert. */
const written = JSON.parse(readFileSync(file, 'utf8'));
const reference = Object.keys(written.it);
let problems = 0;
for (const lang of Object.keys(written).filter((key) => !key.startsWith('_'))) {
  const missing = reference.filter((key) => written[lang][key] === undefined);
  if (missing.length) {
    problems += 1;
    console.log(`FAIL  ${lang} missing: ${missing.join(', ')}`);
  }
}

console.log(`${added} keys added, ${reference.length} keys per language, ${problems} problems`);
process.exit(problems ? 1 : 0);
