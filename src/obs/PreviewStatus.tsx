import type { BroadcastConnection, BroadcastState } from './types';

const copy = {
  pl: {
    title: 'Podgląd OBS', connected: 'Realtime połączony', connecting: 'Łączenie...', disconnected: 'Brak połączenia Realtime',
    loading: 'Pobieranie stanu transmisji', unavailable: 'Nie można jeszcze pobrać stanu. Sprawdź połączenie i konfigurację w adminie.',
    noSponsors: 'Nie dodano jeszcze sponsorów', addSponsors: 'W adminie otwórz LIVE → Dodaj sponsora. Wpisz nazwę, dodaj logo i zapisz. Następnie włącz Sponsorzy ON.',
    inactive: 'Wszyscy sponsorzy są nieaktywni', activate: 'Włącz Aktywny przy wybranych sponsorach w sekcji LIVE i zapisz.',
    off: 'Karuzela sponsorów jest wyłączona', enable: 'W adminie w sekcji LIVE kliknij Sponsorzy OFF, aby przełączyć na ON.',
    running: 'Karuzela włączona', active: 'Aktywni sponsorzy', noPerson: 'Nie wybrano zawodnika', choose: 'W Zgłoszeniach potwierdź zawodnika i kliknij Zjeżdża.',
    hidden: 'Zawodnik jest ukryty', show: 'Kliknij Pokaż wybranego w adminie. Nie trzeba odświeżać OBS.',
    person: 'Zawodnik na antenie', noTime: 'Nie ma jeszcze zapisanego czasu przejazdu.', admin: 'Otwórz sterowanie LIVE', clean: 'Czysty adres do OBS',
    note: 'To podgląd z komunikatami. Do źródła Przeglądarka w OBS wklej adres bez ?preview=1. Szachownica i ten panel nie pojawią się w transmisji.',
  },
  it: {
    title: 'Anteprima OBS', connected: 'Realtime connesso', connecting: 'Connessione...', disconnected: 'Realtime non connesso',
    loading: 'Caricamento stato della diretta', unavailable: 'Stato non ancora disponibile. Controlla connessione e configurazione nel pannello.',
    noSponsors: 'Non sono ancora stati aggiunti sponsor', addSponsors: 'Nel pannello apri LIVE → Aggiungi sponsor. Inserisci nome e logo, salva, poi attiva Sponsor ON.',
    inactive: 'Tutti gli sponsor sono inattivi', activate: 'Abilita Attivo per gli sponsor desiderati nella sezione LIVE e salva.',
    off: 'La fascia sponsor è disattivata', enable: 'Nel pannello LIVE premi Sponsor OFF per passare a ON.',
    running: 'Fascia sponsor attiva', active: 'Sponsor attivi', noPerson: 'Nessun pilota selezionato', choose: 'Nelle Iscrizioni conferma il pilota e premi In discesa.',
    hidden: 'Il pilota è nascosto', show: 'Premi Mostra selezionato nel pannello. Non occorre ricaricare OBS.',
    person: 'Pilota in onda', noTime: 'Non è ancora stato salvato un tempo di discesa.', admin: 'Apri controllo LIVE', clean: 'Indirizzo pulito per OBS',
    note: 'Questa anteprima contiene istruzioni. Nella sorgente Browser di OBS usa l’indirizzo senza ?preview=1. La scacchiera e questo pannello non appariranno in diretta.',
  },
};

export function PreviewStatus({ state, connection, module }: {
  state: BroadcastState | null; connection: BroadcastConnection; module?: string;
}) {
  const language = new URLSearchParams(location.search).get('lang');
  const pl = language === 'pl' || (!language && navigator.language.startsWith('pl'));
  const t = copy[pl ? 'pl' : 'it'];
  const sponsors = state?.sponsors.filter(s => s.active) ?? [];
  const showSponsors = module !== 'participant' && module !== 'replay';
  const showPerson = module !== 'sponsors';
  const sponsorTitle = !state?.sponsors.length ? t.noSponsors : !sponsors.length ? t.inactive : !state.sponsors_enabled ? t.off : t.running;
  const sponsorHint = !state?.sponsors.length ? t.addSponsors : !sponsors.length ? t.activate : !state.sponsors_enabled ? t.enable : `${t.active}: ${sponsors.length}`;

  return <aside className="obs-preview-panel" aria-label={t.title}>
    <header><strong>{t.title}</strong><span data-preview-connection={connection.status}>{connection.status === 'live' ? t.connected : connection.status === 'connecting' ? t.connecting : t.disconnected}</span></header>
    {!state && <section role="status"><h2>{t.loading}</h2><p>{t.unavailable}</p></section>}
    {state && showSponsors && <section data-preview-sponsors role="status"><h2>{sponsorTitle}</h2><p>{sponsorHint}</p></section>}
    {state && showPerson && <section data-preview-participant role="status">
      <h2>{!state.participant ? t.noPerson : !state.participant_visible ? t.hidden : t.person}</h2>
      <p>{!state.participant ? t.choose : !state.participant_visible ? t.show : `#${state.participant.startNumber} ${state.participant.firstName} ${state.participant.lastName}`}</p>
      {module === 'replay' && state.participant && state.participant.raceTimeMs == null && <p>{t.noTime}</p>}
    </section>}
    <nav><a href="/admin?tab=live" target="_blank" rel="noreferrer">{t.admin}</a><a href={location.pathname}>{t.clean}</a></nav>
    <p className="obs-preview-note">{t.note}</p>
  </aside>;
}
