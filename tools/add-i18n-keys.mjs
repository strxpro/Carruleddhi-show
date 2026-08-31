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
  it: {
    'wall.sortNew': 'Più recenti', 'wall.sortBest': 'Meglio votati', 'wall.sortOld': 'Più vecchi',
    'wall.sortLabel': 'Ordina', 'wall.openForm': 'Lascia un messaggio'
  },
  pl: {
    'wall.sortNew': 'Najnowsze', 'wall.sortBest': 'Najlepiej ocenione', 'wall.sortOld': 'Najstarsze',
    'wall.sortLabel': 'Sortuj', 'wall.openForm': 'Zostaw wiadomość'
  },
  en: {
    'wall.sortNew': 'Newest', 'wall.sortBest': 'Best rated', 'wall.sortOld': 'Oldest',
    'wall.sortLabel': 'Sort', 'wall.openForm': 'Leave a message'
  },
  de: {
    'wall.sortNew': 'Neueste', 'wall.sortBest': 'Beste Bewertung', 'wall.sortOld': 'Älteste',
    'wall.sortLabel': 'Sortieren', 'wall.openForm': 'Nachricht hinterlassen'
  },
  es: {
    'wall.sortNew': 'Más recientes', 'wall.sortBest': 'Mejor valorados', 'wall.sortOld': 'Más antiguos',
    'wall.sortLabel': 'Ordenar', 'wall.openForm': 'Deja un mensaje'
  },
  fr: {
    'wall.sortNew': 'Plus récents', 'wall.sortBest': 'Mieux notés', 'wall.sortOld': 'Plus anciens',
    'wall.sortLabel': 'Trier', 'wall.openForm': 'Laissez un message'
  }
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

/* ---------------------------------------------------------- chat: gate and suggestions
   The gate is the name and address asked for before the first message. It is not
   gatekeeping for its own sake: most of what the chat cannot answer ends up with a person,
   and a person answering two hours later needs somewhere to send it.

   The suggestion chips are folded behind a toggle and three at a time. Six of them open all
   the time filled the panel on a phone and pushed the composer off the bottom of the card;
   worse, they never changed, so after the first answer they were six openers to a
   conversation that had already started. */
/* ------------------------------------------------------- tablica: wpis jest już na niej
   `wall.pending` mówi „pojawi się po sprawdzeniu" i od migracji 0015 to nie jest prawda —
   wpis jest widoczny od razu. Stary klucz zostaje, bo powrót do moderacji nie ma wymagać
   drugiej zmiany w kodzie; strona wybiera między nimi na podstawie odpowiedzi serwera. */
const WALL_LIVE = {
  it: { 'wall.published': 'Pubblicato. È sulla bacheca, guarda sotto.' },
  pl: { 'wall.published': 'Opublikowane. Jest już na tablicy, zobacz niżej.' },
  en: { 'wall.published': 'Posted. It is on the wall, just below.' },
  de: { 'wall.published': 'Veröffentlicht. Sie steht auf der Pinnwand, gleich darunter.' },
  es: { 'wall.published': 'Publicado. Está en el muro, justo debajo.' },
  fr: { 'wall.published': 'Publié. C’est sur le mur, juste en dessous.' }
};

/* --------------------------------------------- adres, który już jest na liście startowej
   Panel pokazywany po kliknięciu „Dalej" w kroku 1, gdy ten e-mail jest już zapisany.
   Wcześniej człowiek dowiadywał się o tym po wypełnieniu całego formularza, z komunikatu
   „ten adres już jest" i bez żadnego wyjścia. */
const ENTRY_UI = {
  it: {
    'form.checking': 'Controllo…',
    'entry.foundTitle': 'Questo indirizzo è già iscritto.',
    'entry.foundLead': 'Puoi usare un altro indirizzo, correggere l’iscrizione che hai già, o ritirarti dalla gara.',
    'entry.initials': 'Iscrizione a nome:',
    'entry.useOther': 'Uso un altro indirizzo',
    'entry.editMine': 'Correggi la mia iscrizione',
    'entry.withdraw': 'Ritirami dalla gara',
    'entry.codeLabel': 'Codice a sei cifre',
    'entry.codeSent': 'Codice mandato a',
    'entry.confirm': 'Conferma',
    'entry.back': 'Annulla',
    'entry.save': 'Salva le modifiche',
    'entry.editNote': 'Nome, cognome e data di nascita sono sul modulo firmato: per quelli scrivici in chat.',
    'entry.sending': 'Mando il codice…',
    'entry.checking': 'Verifico…',
    'entry.saving': 'Salvo…',
    'entry.showing': 'La tua iscrizione, numero',
    'entry.saved': 'Fatto. Dati aggiornati.',
    'entry.withdrawn': 'Ti abbiamo ritirato dalla gara. Il tuo numero torna disponibile.',
    'entry.alreadyOut': 'Questa iscrizione è già ritirata.',
    'entry.minorHelp': 'È l’iscrizione di un minore: si cambia solo tramite gli organizzatori, per la liberatoria firmata.',
    'entry.codeShort': 'Il codice ha sei cifre.',
    'entry.codeWrong': 'Codice errato. Tentativi rimasti:',
    'entry.codeExpired': 'Codice scaduto. Chiedine uno nuovo.',
    'entry.codeBlocked': 'Troppi tentativi. Chiedi un codice nuovo.',
    'entry.gone': 'Questa iscrizione non esiste più.',
    'entry.mailFailed': 'Non è stato possibile mandare il codice. Riprova.',
    'entry.failed': 'Qualcosa non ha funzionato. Riprova.'
  },
  pl: {
    'form.checking': 'Sprawdzam…',
    'entry.foundTitle': 'Ten adres jest już zapisany.',
    'entry.foundLead': 'Możesz użyć innego adresu, poprawić swoje zgłoszenie albo zrezygnować z wyścigu.',
    'entry.initials': 'Zgłoszenie na inicjały:',
    'entry.useOther': 'Użyję innego adresu',
    'entry.editMine': 'Popraw moje zgłoszenie',
    'entry.withdraw': 'Rezygnuję z wyścigu',
    'entry.codeLabel': 'Sześciocyfrowy kod',
    'entry.codeSent': 'Kod wysłany na',
    'entry.confirm': 'Potwierdź',
    'entry.back': 'Anuluj',
    'entry.save': 'Zapisz zmiany',
    'entry.editNote': 'Imię, nazwisko i data urodzenia są na podpisanym formularzu — o te napisz do nas na czacie.',
    'entry.sending': 'Wysyłam kod…',
    'entry.checking': 'Sprawdzam…',
    'entry.saving': 'Zapisuję…',
    'entry.showing': 'Twoje zgłoszenie, numer',
    'entry.saved': 'Gotowe. Dane zaktualizowane.',
    'entry.withdrawn': 'Wycofaliśmy Cię z wyścigu. Twój numer wraca do puli.',
    'entry.alreadyOut': 'To zgłoszenie jest już wycofane.',
    'entry.minorHelp': 'To zgłoszenie osoby niepełnoletniej — zmienia się je przez organizatorów, ze względu na podpisaną zgodę.',
    'entry.codeShort': 'Kod ma sześć cyfr.',
    'entry.codeWrong': 'Zły kod. Pozostało prób:',
    'entry.codeExpired': 'Kod wygasł. Poproś o nowy.',
    'entry.codeBlocked': 'Za dużo prób. Poproś o nowy kod.',
    'entry.gone': 'Tego zgłoszenia już nie ma.',
    'entry.mailFailed': 'Nie udało się wysłać kodu. Spróbuj ponownie.',
    'entry.failed': 'Coś nie zadziałało. Spróbuj ponownie.'
  },
  en: {
    'form.checking': 'Checking…',
    'entry.foundTitle': 'This address is already entered.',
    'entry.foundLead': 'You can use another address, correct the entry you already have, or withdraw from the race.',
    'entry.initials': 'Entry under initials:',
    'entry.useOther': 'Use another address',
    'entry.editMine': 'Correct my entry',
    'entry.withdraw': 'Withdraw from the race',
    'entry.codeLabel': 'Six-digit code',
    'entry.codeSent': 'Code sent to',
    'entry.confirm': 'Confirm',
    'entry.back': 'Cancel',
    'entry.save': 'Save the changes',
    'entry.editNote': 'Name, surname and date of birth are on the signed form — for those, write to us in the chat.',
    'entry.sending': 'Sending the code…',
    'entry.checking': 'Checking…',
    'entry.saving': 'Saving…',
    'entry.showing': 'Your entry, number',
    'entry.saved': 'Done. Details updated.',
    'entry.withdrawn': 'You are withdrawn from the race. Your number goes back into the pool.',
    'entry.alreadyOut': 'This entry has already been withdrawn.',
    'entry.minorHelp': 'This is a minor’s entry — it is changed through the organisers, because of the signed authorisation.',
    'entry.codeShort': 'The code has six digits.',
    'entry.codeWrong': 'Wrong code. Tries left:',
    'entry.codeExpired': 'The code has expired. Ask for a new one.',
    'entry.codeBlocked': 'Too many tries. Ask for a new code.',
    'entry.gone': 'This entry no longer exists.',
    'entry.mailFailed': 'The code could not be sent. Try again.',
    'entry.failed': 'Something did not work. Try again.'
  },
  de: {
    'form.checking': 'Prüfe…',
    'entry.foundTitle': 'Diese Adresse ist schon angemeldet.',
    'entry.foundLead': 'Du kannst eine andere Adresse nehmen, deine bestehende Anmeldung korrigieren oder vom Rennen zurücktreten.',
    'entry.initials': 'Anmeldung auf die Initialen:',
    'entry.useOther': 'Andere Adresse nehmen',
    'entry.editMine': 'Meine Anmeldung korrigieren',
    'entry.withdraw': 'Vom Rennen zurücktreten',
    'entry.codeLabel': 'Sechsstelliger Code',
    'entry.codeSent': 'Code gesendet an',
    'entry.confirm': 'Bestätigen',
    'entry.back': 'Abbrechen',
    'entry.save': 'Änderungen speichern',
    'entry.editNote': 'Name, Nachname und Geburtsdatum stehen auf dem unterschriebenen Formular — dafür schreib uns im Chat.',
    'entry.sending': 'Code wird gesendet…',
    'entry.checking': 'Prüfe…',
    'entry.saving': 'Speichere…',
    'entry.showing': 'Deine Anmeldung, Nummer',
    'entry.saved': 'Erledigt. Daten aktualisiert.',
    'entry.withdrawn': 'Du bist vom Rennen zurückgetreten. Deine Nummer geht zurück in den Pool.',
    'entry.alreadyOut': 'Diese Anmeldung ist schon zurückgezogen.',
    'entry.minorHelp': 'Das ist die Anmeldung eines Minderjährigen — sie wird über die Organisatoren geändert, wegen der unterschriebenen Einverständniserklärung.',
    'entry.codeShort': 'Der Code hat sechs Ziffern.',
    'entry.codeWrong': 'Falscher Code. Verbleibende Versuche:',
    'entry.codeExpired': 'Der Code ist abgelaufen. Fordere einen neuen an.',
    'entry.codeBlocked': 'Zu viele Versuche. Fordere einen neuen Code an.',
    'entry.gone': 'Diese Anmeldung existiert nicht mehr.',
    'entry.mailFailed': 'Der Code konnte nicht gesendet werden. Versuch es erneut.',
    'entry.failed': 'Etwas hat nicht funktioniert. Versuch es erneut.'
  },
  es: {
    'form.checking': 'Compruebo…',
    'entry.foundTitle': 'Esta dirección ya está inscrita.',
    'entry.foundLead': 'Puedes usar otra dirección, corregir la inscripción que ya tienes o retirarte de la carrera.',
    'entry.initials': 'Inscripción a nombre de:',
    'entry.useOther': 'Uso otra dirección',
    'entry.editMine': 'Corregir mi inscripción',
    'entry.withdraw': 'Retirarme de la carrera',
    'entry.codeLabel': 'Código de seis cifras',
    'entry.codeSent': 'Código enviado a',
    'entry.confirm': 'Confirmar',
    'entry.back': 'Cancelar',
    'entry.save': 'Guardar los cambios',
    'entry.editNote': 'Nombre, apellido y fecha de nacimiento están en el formulario firmado: para eso, escríbenos por el chat.',
    'entry.sending': 'Enviando el código…',
    'entry.checking': 'Comprobando…',
    'entry.saving': 'Guardando…',
    'entry.showing': 'Tu inscripción, número',
    'entry.saved': 'Hecho. Datos actualizados.',
    'entry.withdrawn': 'Te hemos retirado de la carrera. Tu dorsal vuelve a estar disponible.',
    'entry.alreadyOut': 'Esta inscripción ya está retirada.',
    'entry.minorHelp': 'Es la inscripción de un menor: se cambia a través de los organizadores, por la autorización firmada.',
    'entry.codeShort': 'El código tiene seis cifras.',
    'entry.codeWrong': 'Código incorrecto. Intentos restantes:',
    'entry.codeExpired': 'El código ha caducado. Pide uno nuevo.',
    'entry.codeBlocked': 'Demasiados intentos. Pide un código nuevo.',
    'entry.gone': 'Esta inscripción ya no existe.',
    'entry.mailFailed': 'No se ha podido enviar el código. Inténtalo otra vez.',
    'entry.failed': 'Algo no ha funcionado. Inténtalo otra vez.'
  },
  fr: {
    'form.checking': 'Je vérifie…',
    'entry.foundTitle': 'Cette adresse est déjà inscrite.',
    'entry.foundLead': 'Vous pouvez utiliser une autre adresse, corriger votre inscription, ou vous retirer de la course.',
    'entry.initials': 'Inscription aux initiales :',
    'entry.useOther': 'J’utilise une autre adresse',
    'entry.editMine': 'Corriger mon inscription',
    'entry.withdraw': 'Me retirer de la course',
    'entry.codeLabel': 'Code à six chiffres',
    'entry.codeSent': 'Code envoyé à',
    'entry.confirm': 'Confirmer',
    'entry.back': 'Annuler',
    'entry.save': 'Enregistrer les modifications',
    'entry.editNote': 'Nom, prénom et date de naissance figurent sur le formulaire signé : pour cela, écrivez-nous sur le chat.',
    'entry.sending': 'Envoi du code…',
    'entry.checking': 'Vérification…',
    'entry.saving': 'Enregistrement…',
    'entry.showing': 'Votre inscription, numéro',
    'entry.saved': 'C’est fait. Données mises à jour.',
    'entry.withdrawn': 'Vous êtes retiré de la course. Votre numéro retourne dans la réserve.',
    'entry.alreadyOut': 'Cette inscription est déjà retirée.',
    'entry.minorHelp': 'C’est l’inscription d’un mineur : elle se modifie via les organisateurs, à cause de l’autorisation signée.',
    'entry.codeShort': 'Le code comporte six chiffres.',
    'entry.codeWrong': 'Code incorrect. Essais restants :',
    'entry.codeExpired': 'Le code a expiré. Demandez-en un nouveau.',
    'entry.codeBlocked': 'Trop d’essais. Demandez un nouveau code.',
    'entry.gone': 'Cette inscription n’existe plus.',
    'entry.mailFailed': 'Le code n’a pas pu être envoyé. Réessayez.',
    'entry.failed': 'Quelque chose n’a pas fonctionné. Réessayez.'
  }
};

/* Po zapisaniu zmian idzie nowe potwierdzenie z formularzami — trzeba to powiedzieć, bo
   inaczej człowiek wydrukuje starszy PDF, który ma już w skrzynce. */
const SAVED_MAILED = {
  it: { 'entry.savedMailed': 'Fatto. Ti abbiamo rimandato la conferma con i moduli aggiornati — stampa quella nuova.' },
  pl: { 'entry.savedMailed': 'Gotowe. Wysłaliśmy nowe potwierdzenie z formularzami — wydrukuj to najnowsze.' },
  en: { 'entry.savedMailed': 'Done. We have sent the confirmation again with updated forms — print the newest one.' },
  de: { 'entry.savedMailed': 'Erledigt. Wir haben die Bestätigung mit aktualisierten Formularen erneut gesendet — drucke die neueste.' },
  es: { 'entry.savedMailed': 'Hecho. Te hemos reenviado la confirmación con los formularios actualizados: imprime la más nueva.' },
  fr: { 'entry.savedMailed': 'C’est fait. Nous avons renvoyé la confirmation avec les formulaires à jour — imprimez la plus récente.' }
};

const CHAT_GATE = {
  it: {
    ...WALL_LIVE.it,
    ...SAVED_MAILED.it,
    ...ENTRY_UI.it,
    'chat.gateLead': 'Prima di iniziare: come ti chiami e a quale indirizzo possiamo risponderti?',
    'chat.gateName': 'Come ti chiami *',
    'chat.gateEmail': 'E-mail *',
    'chat.gateStart': 'Inizia la chat',
    'chat.gateNote': 'Serve solo per risponderti. Niente newsletter.',
    'chat.gateBadEmail': 'Controlla l’indirizzo e-mail.',
    'chat.gateBadName': 'Scrivi il tuo nome.',
    'chat.chipsShow': 'Suggerimenti',
    'chat.chipsHide': 'Nascondi',
    'chat.askRules': 'Dove trovo il regolamento?',
    'chat.askCategories': 'Che categorie ci sono?',
    'chat.askMinor': 'Mio figlio può partecipare?',
    'chat.askBuild': 'Come si costruisce il carretto?',
    'chat.askArrive': 'A che ora devo arrivare?',
    'chat.askChange': 'Voglio cambiare i miei dati'
  },
  pl: {
    ...WALL_LIVE.pl,
    ...SAVED_MAILED.pl,
    ...ENTRY_UI.pl,
    'chat.gateLead': 'Zanim zaczniemy: jak się nazywasz i na jaki adres możemy odpisać?',
    'chat.gateName': 'Jak się nazywasz *',
    'chat.gateEmail': 'E-mail *',
    'chat.gateStart': 'Rozpocznij czat',
    'chat.gateNote': 'Tylko do odpisania. Bez newslettera.',
    'chat.gateBadEmail': 'Sprawdź adres e-mail.',
    'chat.gateBadName': 'Wpisz swoje imię.',
    'chat.chipsShow': 'Podpowiedzi',
    'chat.chipsHide': 'Ukryj',
    'chat.askRules': 'Gdzie jest regulamin?',
    'chat.askCategories': 'Jakie są kategorie?',
    'chat.askMinor': 'Czy moje dziecko może startować?',
    'chat.askBuild': 'Jak zbudować wózek?',
    'chat.askArrive': 'O której mam przyjechać?',
    'chat.askChange': 'Chcę zmienić swoje dane'
  },
  en: {
    ...WALL_LIVE.en,
    ...SAVED_MAILED.en,
    ...ENTRY_UI.en,
    'chat.gateLead': 'Before we start: what is your name, and where can we reply?',
    'chat.gateName': 'Your name *',
    'chat.gateEmail': 'E-mail *',
    'chat.gateStart': 'Start the chat',
    'chat.gateNote': 'Only so we can reply. No newsletter.',
    'chat.gateBadEmail': 'Check the e-mail address.',
    'chat.gateBadName': 'Write your name.',
    'chat.chipsShow': 'Suggestions',
    'chat.chipsHide': 'Hide',
    'chat.askRules': 'Where are the rules?',
    'chat.askCategories': 'What categories are there?',
    'chat.askMinor': 'Can my child take part?',
    'chat.askBuild': 'How do I build the cart?',
    'chat.askArrive': 'What time should I arrive?',
    'chat.askChange': 'I want to change my details'
  },
  de: {
    ...WALL_LIVE.de,
    ...SAVED_MAILED.de,
    ...ENTRY_UI.de,
    'chat.gateLead': 'Bevor wir anfangen: wie heißt du, und an welche Adresse können wir antworten?',
    'chat.gateName': 'Dein Name *',
    'chat.gateEmail': 'E-Mail *',
    'chat.gateStart': 'Chat starten',
    'chat.gateNote': 'Nur damit wir antworten können. Kein Newsletter.',
    'chat.gateBadEmail': 'Prüfe die E-Mail-Adresse.',
    'chat.gateBadName': 'Schreib deinen Namen.',
    'chat.chipsShow': 'Vorschläge',
    'chat.chipsHide': 'Ausblenden',
    'chat.askRules': 'Wo finde ich die Regeln?',
    'chat.askCategories': 'Welche Kategorien gibt es?',
    'chat.askMinor': 'Darf mein Kind mitfahren?',
    'chat.askBuild': 'Wie baue ich den Wagen?',
    'chat.askArrive': 'Wann soll ich da sein?',
    'chat.askChange': 'Ich möchte meine Daten ändern'
  },
  es: {
    ...WALL_LIVE.es,
    ...SAVED_MAILED.es,
    ...ENTRY_UI.es,
    'chat.gateLead': 'Antes de empezar: ¿cómo te llamas y a qué dirección podemos responderte?',
    'chat.gateName': 'Tu nombre *',
    'chat.gateEmail': 'E-mail *',
    'chat.gateStart': 'Empezar el chat',
    'chat.gateNote': 'Solo para poder responderte. Sin newsletter.',
    'chat.gateBadEmail': 'Revisa la dirección de correo.',
    'chat.gateBadName': 'Escribe tu nombre.',
    'chat.chipsShow': 'Sugerencias',
    'chat.chipsHide': 'Ocultar',
    'chat.askRules': '¿Dónde está el reglamento?',
    'chat.askCategories': '¿Qué categorías hay?',
    'chat.askMinor': '¿Puede participar mi hijo?',
    'chat.askBuild': '¿Cómo se construye el carro?',
    'chat.askArrive': '¿A qué hora tengo que llegar?',
    'chat.askChange': 'Quiero cambiar mis datos'
  },
  fr: {
    ...WALL_LIVE.fr,
    ...SAVED_MAILED.fr,
    ...ENTRY_UI.fr,
    'chat.gateLead': 'Avant de commencer : comment vous appelez-vous, et à quelle adresse pouvons-nous répondre ?',
    'chat.gateName': 'Votre nom *',
    'chat.gateEmail': 'E-mail *',
    'chat.gateStart': 'Démarrer le chat',
    'chat.gateNote': 'Uniquement pour vous répondre. Pas de newsletter.',
    'chat.gateBadEmail': 'Vérifiez l’adresse e-mail.',
    'chat.gateBadName': 'Écrivez votre nom.',
    'chat.chipsShow': 'Suggestions',
    'chat.chipsHide': 'Masquer',
    'chat.askRules': 'Où est le règlement ?',
    'chat.askCategories': 'Quelles catégories existent ?',
    'chat.askMinor': 'Mon enfant peut-il participer ?',
    'chat.askBuild': 'Comment construire le chariot ?',
    'chat.askArrive': 'À quelle heure dois-je arriver ?',
    'chat.askChange': 'Je veux modifier mes données'
  }
};

/* ------------------------------------------------------------- remis punktowy
   Dwa wozy z tą samą sumą punktów stoją jeden nad drugim i nic na ekranie nie mówi
   dlaczego. Wygląda to na losowe, a nie jest: kolejność rozstrzyga liczba głosów, potem
   średnia, a na końcu numer startowy — ten sam łańcuch w bazie (migracja 0030), w Workerze
   i na stronie. Te napisy nazywają kryterium, które w danej grupie naprawdę zadecydowało.

   `tieAhead` jest łącznikiem, nie zdaniem: składa się z etykietą kryterium w jedną linijkę
   („Remis punktowy · wyżej dzięki: więcej głosów"), bo trzy osobne klucze na jedno zdanie
   znaczą trzy miejsca, w których można je rozjechać między językami. */
const TIE = {
  it: {
    'voting.tie': 'Pari merito',
    'voting.tieAhead': 'davanti per',
    'voting.tieVotes': 'più voti',
    'voting.tieAvg': 'media più alta',
    'voting.tieNumber': 'numero di partenza più basso'
  },
  pl: {
    'voting.tie': 'Remis punktowy',
    'voting.tieAhead': 'wyżej dzięki',
    'voting.tieVotes': 'więcej głosów',
    'voting.tieAvg': 'wyższa średnia',
    'voting.tieNumber': 'niższy numer startowy'
  },
  en: {
    'voting.tie': 'Tied on points',
    'voting.tieAhead': 'ahead on',
    'voting.tieVotes': 'more votes',
    'voting.tieAvg': 'higher average',
    'voting.tieNumber': 'lower start number'
  },
  de: {
    'voting.tie': 'Punktgleich',
    'voting.tieAhead': 'vorn durch',
    'voting.tieVotes': 'mehr Stimmen',
    'voting.tieAvg': 'höheren Schnitt',
    'voting.tieNumber': 'niedrigere Startnummer'
  },
  es: {
    'voting.tie': 'Empate a puntos',
    'voting.tieAhead': 'por delante por',
    'voting.tieVotes': 'más votos',
    'voting.tieAvg': 'media más alta',
    'voting.tieNumber': 'número de salida más bajo'
  },
  fr: {
    'voting.tie': 'À égalité',
    'voting.tieAhead': 'devant grâce à',
    'voting.tieVotes': 'plus de voix',
    'voting.tieAvg': 'moyenne plus haute',
    'voting.tieNumber': 'numéro de départ plus bas'
  }
};

const ADDITIONS = {
  it: {
    ...CHAT_UI.it,
    ...CHAT_GATE.it,
    ...TIE.it,
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
    ...CHAT_GATE.pl,
    ...TIE.pl,
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
    ...CHAT_GATE.en,
    ...TIE.en,
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
    ...CHAT_GATE.de,
    ...TIE.de,
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
    ...CHAT_GATE.es,
    ...TIE.es,
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
    ...CHAT_GATE.fr,
    ...TIE.fr,
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
