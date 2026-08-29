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
  'nav.voting': 'Głosowanie',
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

  /* Głosowanie publiczności. Faza jest liczona przez Workera z zegara — panel jej nie
     wylicza, tylko pokazuje, i dlatego jest tu osobny napis na „zamknięte ręcznie":
     rozjazd między deklaracją organizatora a zegarem jest informacją, nie błędem. */
  'vote.phase': 'Stan głosowania',
  'vote.phaseScheduled': 'Przed startem',
  'vote.phaseVoting': 'Głosowanie otwarte',
  'vote.phaseClosed': 'Głosowanie zamknięte',
  'vote.manualClosed': 'Zamknięte ręcznie — zegar tego nie odwróci.',
  'vote.timer': 'Czas',
  'vote.raceStart': 'Start wyścigu',
  'vote.duration': 'Czas trwania głosowania',
  'vote.minutes': 'minut',
  'vote.endsAt': 'Koniec głosowania',
  'vote.saveSchedule': 'Zapisz termin',
  'vote.openNow': 'Otwórz teraz',
  'vote.closeNow': 'Zamknij teraz',
  'vote.closeConfirm': 'Zamknąć głosowanie? Po zamknięciu nikt już nie zmieni oceny.',
  'vote.needStart': 'Najpierw podaj termin startu.',

  'vote.participants': 'Uczestnicy',
  'vote.addParticipant': 'Dodaj uczestnika',
  'vote.startNumber': 'Numer',
  'vote.category': 'Kategoria',
  'vote.firstName': 'Imię',
  'vote.lastName': 'Nazwisko',
  'vote.project': 'Nazwa pojazdu',
  'vote.photo': 'Zdjęcie',
  'vote.uploadPhoto': 'Wgraj zdjęcie',
  'vote.uploading': 'Wgrywam…',
  'vote.active': 'W głosowaniu',
  'vote.inactive': 'Wyłączony',
  'vote.noParticipants': 'Nie ma jeszcze żadnego uczestnika. Bez nich głosowanie nie ma na co się otworzyć.',
  'vote.numberTaken': 'Ten numer startowy jest już zajęty.',
  'vote.photoTooBig': 'Zdjęcie jest za duże albo w nieobsługiwanym formacie.',
  'vote.remove': 'Usuń',
  'vote.removeConfirm': 'Usunąć uczestnika razem z oddanymi na niego głosami? Do wycofania z zawodów służy „Wyłączony".',
  'vote.save': 'Zapisz',
  'vote.saved': 'Zapisane.',

  'vote.results': 'Wyniki',
  'vote.totalVotes': 'Oddanych głosów',
  'vote.average': 'Średnia',
  'vote.votes': 'głosów',
  'vote.winners': 'Zwycięzcy',
  'vote.winnersSend': 'Wyślij maile na podium',
  'vote.winnersSent': 'Wysłane:',
  'vote.winnersUnreachable': 'Bez adresu — zadzwoń:',
  'vote.winnersStillOpen': 'Najpierw zamknij głosowanie.',
  'vote.winnersNoResults': 'Nikt jeszcze nie dostał ani jednego głosu.',

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
  'nav.voting': 'Voto',
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

  'vote.phase': 'Stato del voto',
  'vote.phaseScheduled': 'Prima della partenza',
  'vote.phaseVoting': 'Voto aperto',
  'vote.phaseClosed': 'Voto chiuso',
  'vote.manualClosed': 'Chiuso a mano — l’orologio non lo riapre.',
  'vote.timer': 'Tempi',
  'vote.raceStart': 'Partenza della gara',
  'vote.duration': 'Durata del voto',
  'vote.minutes': 'minuti',
  'vote.endsAt': 'Fine del voto',
  'vote.saveSchedule': 'Salva i tempi',
  'vote.openNow': 'Apri adesso',
  'vote.closeNow': 'Chiudi adesso',
  'vote.closeConfirm': 'Chiudere il voto? Dopo nessuno può più cambiare il proprio voto.',
  'vote.needStart': 'Prima indica l’ora di partenza.',

  'vote.participants': 'Partecipanti',
  'vote.addParticipant': 'Aggiungi partecipante',
  'vote.startNumber': 'Numero',
  'vote.category': 'Categoria',
  'vote.firstName': 'Nome',
  'vote.lastName': 'Cognome',
  'vote.project': 'Nome del carretto',
  'vote.photo': 'Foto',
  'vote.uploadPhoto': 'Carica la foto',
  'vote.uploading': 'Caricamento…',
  'vote.active': 'In votazione',
  'vote.inactive': 'Escluso',
  'vote.noParticipants': 'Non c’è ancora nessun partecipante. Senza di loro il voto non ha su cosa aprirsi.',
  'vote.numberTaken': 'Questo numero di partenza è già assegnato.',
  'vote.photoTooBig': 'La foto è troppo grande o in un formato non supportato.',
  'vote.remove': 'Elimina',
  'vote.removeConfirm': 'Eliminare il partecipante insieme ai voti ricevuti? Per ritirarlo dalla gara usa «Escluso».',
  'vote.save': 'Salva',
  'vote.saved': 'Salvato.',

  'vote.results': 'Risultati',
  'vote.totalVotes': 'Voti ricevuti',
  'vote.average': 'Media',
  'vote.votes': 'voti',
  'vote.winners': 'Vincitori',
  'vote.winnersSend': 'Invia le mail del podio',
  'vote.winnersSent': 'Inviate:',
  'vote.winnersUnreachable': 'Senza indirizzo — telefona:',
  'vote.winnersStillOpen': 'Prima chiudi il voto.',
  'vote.winnersNoResults': 'Nessuno ha ancora ricevuto un voto.',

  'lang.label': 'Lingua del pannello'
};

export const DICTIONARIES: Record<Locale, Dict> = { pl, it };

export const LANGUAGE_NAMES: Record<Locale, string> = {
  pl: 'Polski',
  it: 'Italiano'
};
