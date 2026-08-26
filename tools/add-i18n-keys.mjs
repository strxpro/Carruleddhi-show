/**
 * Adds keys to assets/js/i18n.js, in every language, in one pass.
 *
 * That file is one object per language with the keys packed several to a line, which makes
 * a hand edit six near-identical edits in six places — and six chances to put a French
 * string in the German block. This inserts each new key immediately after an existing
 * anchor key inside the same language object, so a missing anchor is an error rather than
 * a key that lands in the wrong language.
 *
 *     node tools/add-i18n-keys.mjs
 *
 * Idempotent: a key that is already present in a language is skipped.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'assets', 'js', 'i18n.js');
let source = readFileSync(file, 'utf8');

/* Anchor: the key the new ones are inserted after. It has to exist exactly once per
   language block, which `modal.time3` does — it is the last of the three reminder chips,
   so the new "too late" line reads next to them in the file as well as on the page. */
const ANCHOR = 'modal.time3';

const WALL_SORT = {
  it: { 'wall.sortNew': 'Più recenti', 'wall.sortBest': 'Meglio votati', 'wall.sortOld': 'Più vecchi' },
  pl: { 'wall.sortNew': 'Najnowsze', 'wall.sortBest': 'Najlepiej ocenione', 'wall.sortOld': 'Najstarsze' },
  en: { 'wall.sortNew': 'Newest', 'wall.sortBest': 'Best rated', 'wall.sortOld': 'Oldest' },
  de: { 'wall.sortNew': 'Neueste', 'wall.sortBest': 'Beste Bewertung', 'wall.sortOld': 'Älteste' },
  es: { 'wall.sortNew': 'Más recientes', 'wall.sortBest': 'Mejor valorados', 'wall.sortOld': 'Más antiguos' },
  fr: { 'wall.sortNew': 'Plus récents', 'wall.sortBest': 'Mieux notés', 'wall.sortOld': 'Plus anciens' }
};

const CHAT_UI = {
  it: {
    ...WALL_SORT.it,
    'contact.tabForm': 'Messaggio veloce',
    'contact.tabChat': 'Chat dal vivo',
    'chat.greeting': 'Ciao! Chiedimi quello che ti serve sulla gara. Se non lo so, passo la domanda agli organizzatori.',
    'chat.placeholder': 'Scrivi qui…',
    'chat.inputLabel': 'Il tuo messaggio',
    'chat.send': 'Invia',
    'chat.you': 'Tu',
    'chat.bot': 'Automatico',
    'chat.them': 'Organizzatori',
    'chat.note': 'Le risposte automatiche coprono le domande frequenti. Tutto il resto arriva agli organizzatori.',
    'chat.offline': 'Chat non raggiungibile. Usa il modulo qui accanto.',
    'chat.sendFailed': 'Messaggio non inviato. Riprova.',
    'chat.askWho': 'Chi può partecipare?',
    'chat.askCost': 'Quanto costa?',
    'chat.askHelmet': 'Serve il casco?',
    'chat.askWhen': 'Quando e dove?',
    'chat.askNumber': 'Come ricevo il numero?',
    'chat.askCancel': 'Voglio ritirarmi dalla gara'
  },
  pl: {
    ...WALL_SORT.pl,
    'contact.tabForm': 'Szybka wiadomość',
    'contact.tabChat': 'Czat na żywo',
    'chat.greeting': 'Cześć! Pytaj o cokolwiek związanego z wyścigiem. Czego nie wiem, przekażę organizatorom.',
    'chat.placeholder': 'Napisz tutaj…',
    'chat.inputLabel': 'Twoja wiadomość',
    'chat.send': 'Wyślij',
    'chat.you': 'Ty',
    'chat.bot': 'Automat',
    'chat.them': 'Organizator',
    'chat.note': 'Automat odpowiada na częste pytania. Wszystko inne trafia do organizatorów.',
    'chat.offline': 'Czat niedostępny. Skorzystaj z formularza obok.',
    'chat.sendFailed': 'Wiadomość nie wyszła. Spróbuj ponownie.',
    'chat.askWho': 'Kto może startować?',
    'chat.askCost': 'Ile to kosztuje?',
    'chat.askHelmet': 'Czy kask jest obowiązkowy?',
    'chat.askWhen': 'Kiedy i gdzie?',
    'chat.askNumber': 'Jak dostanę numer startowy?',
    'chat.askCancel': 'Chcę zrezygnować z wyścigu'
  },
  en: {
    ...WALL_SORT.en,
    'contact.tabForm': 'Quick message',
    'contact.tabChat': 'Live chat',
    'chat.greeting': 'Hello! Ask me anything about the race. What I do not know, I pass to the organisers.',
    'chat.placeholder': 'Write here…',
    'chat.inputLabel': 'Your message',
    'chat.send': 'Send',
    'chat.you': 'You',
    'chat.bot': 'Automatic',
    'chat.them': 'Organisers',
    'chat.note': 'The automatic answers cover the frequent questions. Everything else reaches the organisers.',
    'chat.offline': 'Chat unreachable. Use the form beside it.',
    'chat.sendFailed': 'Message not sent. Try again.',
    'chat.askWho': 'Who can take part?',
    'chat.askCost': 'What does it cost?',
    'chat.askHelmet': 'Is a helmet required?',
    'chat.askWhen': 'When and where?',
    'chat.askNumber': 'How do I get my number?',
    'chat.askCancel': 'I want to withdraw from the race'
  },
  de: {
    ...WALL_SORT.de,
    'contact.tabForm': 'Kurze Nachricht',
    'contact.tabChat': 'Live-Chat',
    'chat.greeting': 'Hallo! Frag mich alles zum Rennen. Was ich nicht weiß, gebe ich an die Organisatoren weiter.',
    'chat.placeholder': 'Schreib hier…',
    'chat.inputLabel': 'Deine Nachricht',
    'chat.send': 'Senden',
    'chat.you': 'Du',
    'chat.bot': 'Automatisch',
    'chat.them': 'Organisatoren',
    'chat.note': 'Die automatischen Antworten decken die häufigen Fragen ab. Alles andere geht an die Organisatoren.',
    'chat.offline': 'Chat nicht erreichbar. Nutze das Formular daneben.',
    'chat.sendFailed': 'Nachricht nicht gesendet. Versuch es erneut.',
    'chat.askWho': 'Wer darf teilnehmen?',
    'chat.askCost': 'Was kostet es?',
    'chat.askHelmet': 'Ist ein Helm Pflicht?',
    'chat.askWhen': 'Wann und wo?',
    'chat.askNumber': 'Wie bekomme ich die Startnummer?',
    'chat.askCancel': 'Ich möchte vom Rennen zurücktreten'
  },
  es: {
    ...WALL_SORT.es,
    'contact.tabForm': 'Mensaje rápido',
    'contact.tabChat': 'Chat en directo',
    'chat.greeting': '¡Hola! Pregúntame lo que quieras sobre la carrera. Lo que no sepa, lo paso a los organizadores.',
    'chat.placeholder': 'Escribe aquí…',
    'chat.inputLabel': 'Tu mensaje',
    'chat.send': 'Enviar',
    'chat.you': 'Tú',
    'chat.bot': 'Automático',
    'chat.them': 'Organizadores',
    'chat.note': 'Las respuestas automáticas cubren las preguntas frecuentes. Todo lo demás llega a los organizadores.',
    'chat.offline': 'Chat no disponible. Usa el formulario de al lado.',
    'chat.sendFailed': 'El mensaje no se ha enviado. Inténtalo otra vez.',
    'chat.askWho': '¿Quién puede participar?',
    'chat.askCost': '¿Cuánto cuesta?',
    'chat.askHelmet': '¿El casco es obligatorio?',
    'chat.askWhen': '¿Cuándo y dónde?',
    'chat.askNumber': '¿Cómo recibo el dorsal?',
    'chat.askCancel': 'Quiero retirarme de la carrera'
  },
  fr: {
    ...WALL_SORT.fr,
    'contact.tabForm': 'Message rapide',
    'contact.tabChat': 'Chat en direct',
    'chat.greeting': 'Bonjour ! Demandez-moi ce que vous voulez sur la course. Ce que je ne sais pas, je le transmets aux organisateurs.',
    'chat.placeholder': 'Écrivez ici…',
    'chat.inputLabel': 'Votre message',
    'chat.send': 'Envoyer',
    'chat.you': 'Vous',
    'chat.bot': 'Automatique',
    'chat.them': 'Organisateurs',
    'chat.note': 'Les réponses automatiques couvrent les questions fréquentes. Tout le reste arrive aux organisateurs.',
    'chat.offline': 'Chat indisponible. Utilisez le formulaire à côté.',
    'chat.sendFailed': 'Message non envoyé. Réessayez.',
    'chat.askWho': 'Qui peut participer ?',
    'chat.askCost': 'Combien ça coûte ?',
    'chat.askHelmet': 'Le casque est-il obligatoire ?',
    'chat.askWhen': 'Quand et où ?',
    'chat.askNumber': 'Comment je reçois mon numéro ?',
    'chat.askCancel': 'Je veux me retirer de la course'
  }
};

const ADDITIONS = {
  it: {
    ...CHAT_UI.it,
    'unsub.title': 'Disattivare gli avvisi?',
    'unsub.leadStart': 'Mandiamo un codice a questo indirizzo:',
    'unsub.send': 'Manda il codice',
    'unsub.leadCode': 'Scrivi le sei cifre del messaggio. Il codice vale 15 minuti.',
    'unsub.codeLabel': 'Codice a sei cifre',
    'unsub.confirm': 'Conferma',
    'unsub.done': 'Fatto. Non ti scriviamo più.',
    'unsub.sending': 'Mando il codice…',
    'unsub.sent': 'Codice mandato. Controlla la posta.',
    'unsub.sendFailed': 'Non è stato possibile mandare il codice. Riprova.',
    'unsub.checking': 'Verifico…',
    'unsub.codeShort': 'Il codice ha sei cifre.',
    'unsub.codeWrong': 'Codice errato. Tentativi rimasti:',
    'unsub.codeExpired': 'Codice scaduto. Chiedine uno nuovo.',
    'unsub.codeBlocked': 'Troppi tentativi. Chiedi un codice nuovo.',
    'unsub.alreadyOff': 'Gli avvisi erano già disattivati.',
    'unsub.badLink': 'Questo link non è più valido.',
    'unsub.offline': 'Nessuna connessione. Riprova.'
  },
  pl: {
    ...CHAT_UI.pl,
    'unsub.title': 'Wyłączyć powiadomienia?',
    'unsub.leadStart': 'Wyślemy kod na ten adres:',
    'unsub.send': 'Wyślij kod',
    'unsub.leadCode': 'Wpisz sześć cyfr z wiadomości. Kod jest ważny 15 minut.',
    'unsub.codeLabel': 'Sześciocyfrowy kod',
    'unsub.confirm': 'Potwierdź',
    'unsub.done': 'Gotowe. Nie będziemy już pisać.',
    'unsub.sending': 'Wysyłam kod…',
    'unsub.sent': 'Kod wysłany. Sprawdź skrzynkę.',
    'unsub.sendFailed': 'Nie udało się wysłać kodu. Spróbuj ponownie.',
    'unsub.checking': 'Sprawdzam…',
    'unsub.codeShort': 'Kod ma sześć cyfr.',
    'unsub.codeWrong': 'Zły kod. Pozostało prób:',
    'unsub.codeExpired': 'Kod wygasł. Poproś o nowy.',
    'unsub.codeBlocked': 'Za dużo prób. Poproś o nowy kod.',
    'unsub.alreadyOff': 'Powiadomienia były już wyłączone.',
    'unsub.badLink': 'Ten link już nie działa.',
    'unsub.offline': 'Brak połączenia. Spróbuj ponownie.'
  },
  en: {
    ...CHAT_UI.en,
    'unsub.title': 'Switch the reminders off?',
    'unsub.leadStart': 'We will send a code to this address:',
    'unsub.send': 'Send the code',
    'unsub.leadCode': 'Type the six digits from the message. The code lasts 15 minutes.',
    'unsub.codeLabel': 'Six-digit code',
    'unsub.confirm': 'Confirm',
    'unsub.done': 'Done. We will not write again.',
    'unsub.sending': 'Sending the code…',
    'unsub.sent': 'Code sent. Check your inbox.',
    'unsub.sendFailed': 'The code could not be sent. Try again.',
    'unsub.checking': 'Checking…',
    'unsub.codeShort': 'The code has six digits.',
    'unsub.codeWrong': 'Wrong code. Tries left:',
    'unsub.codeExpired': 'The code has expired. Ask for a new one.',
    'unsub.codeBlocked': 'Too many tries. Ask for a new code.',
    'unsub.alreadyOff': 'The reminders were already off.',
    'unsub.badLink': 'This link no longer works.',
    'unsub.offline': 'No connection. Try again.'
  },
  de: {
    ...CHAT_UI.de,
    'unsub.title': 'Erinnerungen abschalten?',
    'unsub.leadStart': 'Wir senden einen Code an diese Adresse:',
    'unsub.send': 'Code senden',
    'unsub.leadCode': 'Gib die sechs Ziffern aus der Nachricht ein. Der Code gilt 15 Minuten.',
    'unsub.codeLabel': 'Sechsstelliger Code',
    'unsub.confirm': 'Bestätigen',
    'unsub.done': 'Erledigt. Wir schreiben nicht mehr.',
    'unsub.sending': 'Code wird gesendet…',
    'unsub.sent': 'Code gesendet. Schau in dein Postfach.',
    'unsub.sendFailed': 'Der Code konnte nicht gesendet werden. Versuch es erneut.',
    'unsub.checking': 'Prüfe…',
    'unsub.codeShort': 'Der Code hat sechs Ziffern.',
    'unsub.codeWrong': 'Falscher Code. Verbleibende Versuche:',
    'unsub.codeExpired': 'Der Code ist abgelaufen. Fordere einen neuen an.',
    'unsub.codeBlocked': 'Zu viele Versuche. Fordere einen neuen Code an.',
    'unsub.alreadyOff': 'Die Erinnerungen waren schon aus.',
    'unsub.badLink': 'Dieser Link funktioniert nicht mehr.',
    'unsub.offline': 'Keine Verbindung. Versuch es erneut.'
  },
  es: {
    ...CHAT_UI.es,
    'unsub.title': '¿Desactivar los avisos?',
    'unsub.leadStart': 'Enviaremos un código a esta dirección:',
    'unsub.send': 'Enviar el código',
    'unsub.leadCode': 'Escribe las seis cifras del mensaje. El código vale 15 minutos.',
    'unsub.codeLabel': 'Código de seis cifras',
    'unsub.confirm': 'Confirmar',
    'unsub.done': 'Hecho. No volveremos a escribir.',
    'unsub.sending': 'Enviando el código…',
    'unsub.sent': 'Código enviado. Mira tu correo.',
    'unsub.sendFailed': 'No se ha podido enviar el código. Inténtalo otra vez.',
    'unsub.checking': 'Comprobando…',
    'unsub.codeShort': 'El código tiene seis cifras.',
    'unsub.codeWrong': 'Código incorrecto. Intentos restantes:',
    'unsub.codeExpired': 'El código ha caducado. Pide uno nuevo.',
    'unsub.codeBlocked': 'Demasiados intentos. Pide un código nuevo.',
    'unsub.alreadyOff': 'Los avisos ya estaban desactivados.',
    'unsub.badLink': 'Este enlace ya no funciona.',
    'unsub.offline': 'Sin conexión. Inténtalo otra vez.'
  },
  fr: {
    ...CHAT_UI.fr,
    'unsub.title': 'Désactiver les rappels ?',
    'unsub.leadStart': 'Nous envoyons un code à cette adresse :',
    'unsub.send': 'Envoyer le code',
    'unsub.leadCode': 'Saisissez les six chiffres du message. Le code est valable 15 minutes.',
    'unsub.codeLabel': 'Code à six chiffres',
    'unsub.confirm': 'Confirmer',
    'unsub.done': 'C’est fait. Nous n’écrirons plus.',
    'unsub.sending': 'Envoi du code…',
    'unsub.sent': 'Code envoyé. Vérifiez votre boîte.',
    'unsub.sendFailed': 'Le code n’a pas pu être envoyé. Réessayez.',
    'unsub.checking': 'Vérification…',
    'unsub.codeShort': 'Le code comporte six chiffres.',
    'unsub.codeWrong': 'Code incorrect. Essais restants :',
    'unsub.codeExpired': 'Le code a expiré. Demandez-en un nouveau.',
    'unsub.codeBlocked': 'Trop d’essais. Demandez un nouveau code.',
    'unsub.alreadyOff': 'Les rappels étaient déjà désactivés.',
    'unsub.badLink': 'Ce lien ne fonctionne plus.',
    'unsub.offline': 'Pas de connexion. Réessayez.'
  }
};

/* Each language block starts with its code as a property. Located by that rather than by
   line number, because the blocks are reordered and reflowed often enough that a line
   number is a guess with a shelf life. */
function blockRange(code) {
  // Declared as `const it = {`, one per language. Matched on the declaration rather than
  // on a property name, which is what an earlier version guessed and got wrong.
  const start = source.search(new RegExp(`\\bconst\\s+${code}\\s*=\\s*\\{`));
  if (start < 0) throw new Error(`no language block for "${code}"`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return [open, index];
    }
  }
  throw new Error(`unbalanced braces in the "${code}" block`);
}

let added = 0;
for (const [code, keys] of Object.entries(ADDITIONS)) {
  const [open, close] = blockRange(code);
  const block = source.slice(open, close);

  const anchorAt = block.indexOf(`'${ANCHOR}'`);
  if (anchorAt < 0) throw new Error(`anchor "${ANCHOR}" not found in the "${code}" block`);
  // End of the anchor's own entry: the comma that closes it.
  const insertAt = block.indexOf(',', block.indexOf(':', anchorAt)) + 1;

  const fresh = Object.entries(keys).filter(([key]) => !block.includes(`'${key}'`));
  if (fresh.length === 0) {
    console.log(`skip  ${code} already has all ${Object.keys(keys).length} keys`);
    continue;
  }

  const text = fresh
    .map(([key, value]) => ` '${key}': ${JSON.stringify(value).replace(/^"|"$/g, "'").replace(/\\"/g, '"')},`)
    .join('');

  source = source.slice(0, open + insertAt) + text + source.slice(open + insertAt);
  added += fresh.length;
  console.log(`ok    ${code} +${fresh.length}`);
}

writeFileSync(file, source, 'utf8');
console.log(`\n${added} keys added`);
