/**
 * Panel wording, Polish and Italian.
 *
 * Two languages because two people use this: you, and whoever is running the event on
 * the ground in Santa Teresa. A tool that only speaks one of your languages gets used by
 * one of you.
 *
 * Flat keys and a plain object rather than a library. There are about ninety strings and
 * no plural rules to speak of — Intl handles the two places that need them — so a
 * dependency here would be more configuration than translation.
 *
 * `Dict` is derived from the Polish object, so adding a Polish key without an Italian
 * one is a type error rather than a word that shows up untranslated at the race.
 */

export const pl = {
  'locale.intl': 'pl-PL',
  'locale.rel': 'pl',

  'gate.title': 'Panel organizatora',
  'gate.lead': 'Wpisz hasło dostępu. To samo, które ustawiłeś jako ROSTER_KEY.',
  'gate.password': 'Hasło',
  'gate.enter': 'Wejdź',
  'gate.checking': 'Sprawdzam…',
  'gate.wrong': 'Nieprawidłowe hasło.',
  'gate.disabled': 'Serwer nie ma ustawionego hasła ROSTER_KEY.',
  'gate.offline': 'Nie mogę połączyć się z serwerem. Sprawdź wdrożenie.',
  'gate.remember': 'Pozostań zalogowany na tym urządzeniu',

  'nav.dashboard': 'Pulpit',
  'nav.registrations': 'Zgłoszenia',
  'nav.chat': 'Czat',
  'nav.wall': 'Tablica',
  'nav.reminders': 'Przypomnienia',
  'nav.newsletter': 'Newsletter',
  'nav.settings': 'Ustawienia',
  'nav.logout': 'Wyloguj',

  'top.refresh': 'Odśwież',
  'top.markSeen': 'Oznacz jako przeczytane',
  'top.new': 'nowe',

  'dash.title': 'Pulpit',
  'dash.lead': 'Co się zmieniło od Twojej ostatniej wizyty.',
  'dash.registrations': 'Zgłoszenia',
  'dash.contacts': 'Wiadomości',
  'dash.chats': 'Czaty czekające',
  'dash.wall': 'Tablica do sprawdzenia',
  'dash.reminders': 'Przypomnienia',
  'dash.newsletter': 'Newsletter',
  'dash.since': 'Od',
  'dash.nothing': 'Nic nowego. Wszystko przejrzane.',

  'reg.title': 'Zgłoszenia',
  'reg.lead': 'Lista zawodników. Numery startowe nadaje baza i nigdy się nie powtarzają.',
  'reg.search': 'Szukaj: nazwisko, numer, wózek, e-mail…',
  'reg.number': 'Nr',
  'reg.rider': 'Zawodnik',
  'reg.cart': 'Carruleddhu',
  'reg.category': 'Kategoria',
  'reg.contact': 'Kontakt',
  'reg.status': 'Status',
  'reg.minor': 'niepełnoletni',
  'reg.guardian': 'Opiekun',
  'reg.empty': 'Nikt się jeszcze nie zapisał.',
  'reg.count': 'zgłoszeń',
  'reg.print': 'Drukuj karty',

  'chat.title': 'Czat na żywo',
  'chat.lead': 'Rozmowy ze strony. Te oznaczone kolorem czekają na człowieka.',
  'chat.threads': 'Rozmowy',
  'chat.empty': 'Nikt jeszcze nie napisał.',
  'chat.pick': 'Wybierz rozmowę z listy.',
  'chat.placeholder': 'Napisz odpowiedź…',
  'chat.send': 'Wyślij',
  'chat.sending': 'Wysyłam…',
  'chat.you': 'Ty',
  'chat.bot': 'Automat',
  'chat.visitor': 'Gość',
  'chat.delivered': 'Dostarczone',
  'chat.modeAi': 'Automat odpowiada',
  'chat.modeHuman': 'Czeka na Ciebie',
  'chat.modeClosed': 'Zamknięta',
  'chat.close': 'Zamknij rozmowę',
  'chat.reopen': 'Otwórz ponownie',
  'chat.handBack': 'Oddaj automatowi',
  'chat.typing': 'pisze…',
  'chat.noEmail': 'bez adresu',

  'wall.title': 'Tablica',
  'wall.lead': 'Nowy wpis nie pokazuje się sam. Każdy czeka tutaj na zatwierdzenie.',
  'wall.pending': 'Oczekujące',
  'wall.approved': 'Zatwierdzone',
  'wall.all': 'Wszystkie',
  'wall.approve': 'Zatwierdź',
  'wall.hide': 'Ukryj',
  'wall.delete': 'Usuń',
  'wall.onSite': 'na stronie',
  'wall.waiting': 'oczekuje',
  'wall.empty': 'Nic nie czeka na zatwierdzenie.',
  'wall.confirmDelete': 'Usunąć ten wpis razem ze zdjęciem? Tego nie da się cofnąć.',

  'rem.title': 'Przypomnienia',
  'rem.lead': 'Kto poprosił o trzy przypomnienia przed zjazdem.',
  'news.title': 'Newsletter',
  'news.lead': 'Kto chce wiedzieć o kolejnych edycjach.',
  'news.announce': 'Ogłoś nową edycję',
  'news.announceSoon': 'Scenariusz ogłoszenia jeszcze nie istnieje.',

  'set.title': 'Ustawienia',
  'set.lead': 'Co jest podłączone i gdzie to zmienić.',
  'set.language': 'Język panelu',
  'set.session': 'Sesja',
  'set.forget': 'Zapomnij hasło na tym urządzeniu',

  'common.loading': 'Wczytuję…',
  'common.error': 'Nie udało się wczytać danych.',
  'common.retry': 'Spróbuj ponownie',
  'common.none': '—',
  'common.yes': 'tak',
  'common.no': 'nie'
} as const;

export type Dict = { [K in keyof typeof pl]: string };

export const it: Dict = {
  'locale.intl': 'it-IT',
  'locale.rel': 'it',

  'gate.title': 'Pannello organizzatori',
  'gate.lead': 'Inserisci la password di accesso, la stessa impostata come ROSTER_KEY.',
  'gate.password': 'Password',
  'gate.enter': 'Entra',
  'gate.checking': 'Verifico…',
  'gate.wrong': 'Password errata.',
  'gate.disabled': 'Il server non ha una ROSTER_KEY impostata.',
  'gate.offline': 'Non riesco a raggiungere il server. Controlla il deploy.',
  'gate.remember': 'Resta connesso su questo dispositivo',

  'nav.dashboard': 'Riepilogo',
  'nav.registrations': 'Iscrizioni',
  'nav.chat': 'Chat',
  'nav.wall': 'Bacheca',
  'nav.reminders': 'Promemoria',
  'nav.newsletter': 'Newsletter',
  'nav.settings': 'Impostazioni',
  'nav.logout': 'Esci',

  'top.refresh': 'Aggiorna',
  'top.markSeen': 'Segna come letto',
  'top.new': 'nuovi',

  'dash.title': 'Riepilogo',
  'dash.lead': 'Cosa è cambiato dalla tua ultima visita.',
  'dash.registrations': 'Iscrizioni',
  'dash.contacts': 'Messaggi',
  'dash.chats': 'Chat in attesa',
  'dash.wall': 'Bacheca da controllare',
  'dash.reminders': 'Promemoria',
  'dash.newsletter': 'Newsletter',
  'dash.since': 'Dal',
  'dash.nothing': 'Niente di nuovo. Tutto controllato.',

  'reg.title': 'Iscrizioni',
  'reg.lead': 'Elenco dei piloti. I numeri di partenza li assegna il database e non si ripetono mai.',
  'reg.search': 'Cerca: cognome, numero, carruleddhu, e-mail…',
  'reg.number': 'N.',
  'reg.rider': 'Pilota',
  'reg.cart': 'Carruleddhu',
  'reg.category': 'Categoria',
  'reg.contact': 'Contatti',
  'reg.status': 'Stato',
  'reg.minor': 'minorenne',
  'reg.guardian': 'Chi firma',
  'reg.empty': 'Nessuna iscrizione per ora.',
  'reg.count': 'iscrizioni',
  'reg.print': 'Stampa le schede',

  'chat.title': 'Chat dal vivo',
  'chat.lead': 'Conversazioni dal sito. Quelle evidenziate aspettano una persona.',
  'chat.threads': 'Conversazioni',
  'chat.empty': 'Nessuno ha ancora scritto.',
  'chat.pick': 'Scegli una conversazione dall’elenco.',
  'chat.placeholder': 'Scrivi una risposta…',
  'chat.send': 'Invia',
  'chat.sending': 'Invio…',
  'chat.you': 'Tu',
  'chat.bot': 'Automatico',
  'chat.visitor': 'Visitatore',
  'chat.delivered': 'Consegnato',
  'chat.modeAi': 'Risponde l’automatico',
  'chat.modeHuman': 'Aspetta te',
  'chat.modeClosed': 'Chiusa',
  'chat.close': 'Chiudi la conversazione',
  'chat.reopen': 'Riapri',
  'chat.handBack': 'Torna all’automatico',
  'chat.typing': 'sta scrivendo…',
  'chat.noEmail': 'senza indirizzo',

  'wall.title': 'Bacheca',
  'wall.lead': 'Un messaggio nuovo non appare da solo. Ognuno aspetta qui l’approvazione.',
  'wall.pending': 'In attesa',
  'wall.approved': 'Approvati',
  'wall.all': 'Tutti',
  'wall.approve': 'Approva',
  'wall.hide': 'Nascondi',
  'wall.delete': 'Elimina',
  'wall.onSite': 'sul sito',
  'wall.waiting': 'in attesa',
  'wall.empty': 'Niente in attesa di approvazione.',
  'wall.confirmDelete': 'Eliminare questo messaggio e la sua foto? Non si può annullare.',

  'rem.title': 'Promemoria',
  'rem.lead': 'Chi ha chiesto i tre promemoria prima della discesa.',
  'news.title': 'Newsletter',
  'news.lead': 'Chi vuole sapere delle prossime edizioni.',
  'news.announce': 'Annuncia la nuova edizione',
  'news.announceSoon': 'Lo scenario dell’annuncio non esiste ancora.',

  'set.title': 'Impostazioni',
  'set.lead': 'Cosa è collegato e dove si cambia.',
  'set.language': 'Lingua del pannello',
  'set.session': 'Sessione',
  'set.forget': 'Dimentica la password su questo dispositivo',

  'common.loading': 'Caricamento…',
  'common.error': 'Impossibile caricare i dati.',
  'common.retry': 'Riprova',
  'common.none': '—',
  'common.yes': 'sì',
  'common.no': 'no'
};

export const dictionaries = { pl, it } satisfies Record<string, Dict>;
export type PanelLocale = keyof typeof dictionaries;
export type TranslateKey = keyof Dict;
