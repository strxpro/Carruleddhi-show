/**
 * Polish and Italian for the panel.
 *
 * Two languages because the two people using this do not share one. Flat keys, one
 * object per language, checked by the compiler: `Dict` is derived from the Polish
 * object, so a key added there and forgotten in Italian is a build error rather than
 * the word "chat.title" appearing on screen in front of somebody.
 */

export const LOCALES = ['pl', 'it'] as const;
export type Locale = (typeof LOCALES)[number];

const pl = {
  'app.title': 'Panel',
  'app.subtitle': 'Carruleddhi Show 2026',

  'login.title': 'Panel administracyjny',
  'login.lead': 'Podaj hasło, żeby zobaczyć zgłoszenia, wiadomości i tablicę.',
  'login.password': 'Hasło',
  'login.submit': 'Wejdź',
  'login.wrong': 'Nieprawidłowe hasło.',
  'login.missing': 'Hasło nie jest ustawione w konfiguracji. Zobacz VITE_ADMIN_PASSWORD.',

  'nav.dashboard': 'Pulpit',
  'nav.registrations': 'Zgłoszenia',
  'nav.chat': 'Czat',
  'nav.wall': 'Tablica',
  'nav.reminders': 'Przypomnienia',
  'nav.newsletter': 'Newsletter',
  'nav.settings': 'Ustawienia',
  'nav.logout': 'Wyloguj',

  'common.loading': 'Wczytuję…',
  'common.refresh': 'Odśwież',
  'common.search': 'Szukaj',
  'common.empty': 'Nic tu jeszcze nie ma.',
  'common.error': 'Nie udało się wczytać danych.',
  'common.retry': 'Spróbuj ponownie',
  'common.of': 'z',
  'common.key': 'Hasło dostępu do danych',
  'common.keyHint': 'To ROSTER_KEY z Vercela. Inne niż hasło do panelu.',
  'common.keyMissing': 'Wpisz hasło dostępu do danych, żeby wczytać listę.',

  'reg.number': 'Numer',
  'reg.rider': 'Zawodnik',
  'reg.cart': 'Carruleddhu',
  'reg.category': 'Kategoria',
  'reg.contact': 'Kontakt',
  'reg.status': 'Status',
  'reg.minor': 'Niepełnoletni',
  'reg.guardian': 'Opiekun',
  'reg.count': 'zgłoszeń',
  'reg.print': 'Drukuj karty',

  'dash.registrations': 'Zgłoszenia',
  'dash.attendees': 'Będzie na miejscu',
  'dash.waitingChat': 'Czeka na odpowiedź',
  'dash.waitingWall': 'Czeka na zatwierdzenie',
  'dash.soon': 'Ta zakładka powstaje.',

  'lang.label': 'Język panelu'
} as const;

export type Dict = Record<keyof typeof pl, string>;

const it: Dict = {
  'app.title': 'Pannello',
  'app.subtitle': 'Carruleddhi Show 2026',

  'login.title': 'Pannello di amministrazione',
  'login.lead': 'Inserisci la password per vedere iscrizioni, messaggi e bacheca.',
  'login.password': 'Password',
  'login.submit': 'Entra',
  'login.wrong': 'Password errata.',
  'login.missing': 'La password non è configurata. Vedi VITE_ADMIN_PASSWORD.',

  'nav.dashboard': 'Cruscotto',
  'nav.registrations': 'Iscrizioni',
  'nav.chat': 'Chat',
  'nav.wall': 'Bacheca',
  'nav.reminders': 'Promemoria',
  'nav.newsletter': 'Newsletter',
  'nav.settings': 'Impostazioni',
  'nav.logout': 'Esci',

  'common.loading': 'Caricamento…',
  'common.refresh': 'Aggiorna',
  'common.search': 'Cerca',
  'common.empty': 'Ancora niente qui.',
  'common.error': 'Impossibile caricare i dati.',
  'common.retry': 'Riprova',
  'common.of': 'di',
  'common.key': 'Password di accesso ai dati',
  'common.keyHint': 'È ROSTER_KEY su Vercel. Diversa dalla password del pannello.',
  'common.keyMissing': 'Inserisci la password di accesso ai dati per caricare la lista.',

  'reg.number': 'Numero',
  'reg.rider': 'Pilota',
  'reg.cart': 'Carruleddhu',
  'reg.category': 'Categoria',
  'reg.contact': 'Contatti',
  'reg.status': 'Stato',
  'reg.minor': 'Minorenne',
  'reg.guardian': 'Tutore',
  'reg.count': 'iscrizioni',
  'reg.print': 'Stampa schede',

  'dash.registrations': 'Iscrizioni',
  'dash.attendees': 'Presenze annunciate',
  'dash.waitingChat': 'In attesa di risposta',
  'dash.waitingWall': 'In attesa di approvazione',
  'dash.soon': 'Questa sezione è in costruzione.',

  'lang.label': 'Lingua del pannello'
};

export const DICTIONARIES: Record<Locale, Dict> = { pl, it };

export const LANGUAGE_NAMES: Record<Locale, string> = {
  pl: 'Polski',
  it: 'Italiano'
};
