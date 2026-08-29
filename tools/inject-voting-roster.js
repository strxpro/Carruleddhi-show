/**
 * Podstawiony backend panelu, żeby dało się kliknąć „dodaj z listy startowej" bez Workera.
 *
 * Wstrzykiwane przez `cdp.mjs --inject`, czyli PRZED skryptami strony — inaczej panel zdążyłby
 * pokazać bramę logowania i odpytać prawdziwy adres, zanim cokolwiek podmienimy.
 *
 * Podstawiane jest `fetch`, a nie dane w komponencie, bo sprawdzane ma być to, co naprawdę
 * poleci na serwer po kliknięciu. Zaślepka zapisuje każde żądanie w `window.__sent`, i to jest
 * właściwa treść pomiaru: numer startowy wysłany jako pusty łańcuch dałby
 * `VOTING_BAD_START_NUMBER`, a tego nie widać po samym wyglądzie listy.
 */
window.localStorage.setItem('carruleddhi.admin.key', 'PROBE-KEY');
window.sessionStorage.setItem('carruleddhi.admin.key', 'PROBE-KEY');
/* Zakładka otwiera się od razu na głosowaniu — App.tsx czyta to przy starcie. */
window.sessionStorage.setItem('carruleddhi.admin.tab', 'voting');

window.__sent = [];

const roster = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-08-01T10:00:00Z', raceNumber: '041', firstName: 'Marco', lastName: 'Rossi',
    birthDate: '1994-04-12', postalCode: '07028', email: 'marco@example.com', phone: '+39 333',
    address: 'Via Roma 4', cartName: 'Fulmine di Gallura', category: 'classic', teamName: '',
    cartNotes: '', locale: 'it', status: 'ok', emailStatus: 'sent', printedAt: null,
    selfUpdatedAt: null, emailGroupSize: 1, isMinor: false, riderAge: 32, guardian: null
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    createdAt: '2026-08-02T10:00:00Z', raceNumber: '042', firstName: 'Sara', lastName: 'Bianchi',
    birthDate: '2012-03-04', postalCode: '07028', email: 'sara@example.com', phone: '+39 334',
    address: 'Via Verdi 9', cartName: 'Stella', category: 'junior', teamName: '',
    cartNotes: '', locale: 'it', status: 'ok', emailStatus: 'sent', printedAt: null,
    selfUpdatedAt: null, emailGroupSize: 1, isMinor: true, riderAge: 14, guardian: null
  },
  {
    /* Zapisany BEZ numeru startowego — ma się pokazać z adnotacją, a nie zniknąć. */
    id: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-08-03T10:00:00Z', raceNumber: null, firstName: 'Luca', lastName: 'Verdi',
    birthDate: '1990-01-01', postalCode: '07028', email: 'luca@example.com', phone: '+39 335',
    address: 'Via Dante 1', cartName: 'Tuono', category: 'classic', teamName: '',
    cartNotes: '', locale: 'it', status: 'ok', emailStatus: 'sent', printedAt: null,
    selfUpdatedAt: null, emailGroupSize: 1, isMinor: false, riderAge: 36, guardian: null
  }
];

/* Jeden uczestnik JUŻ dodany z listy — sprawdza odsiewanie po `registrationId`. */
const votingState = {
  ok: true, status: 'scheduled', phase: 'scheduled', raceStartsAt: null, votingEndsAt: null,
  durationMinutes: 30, categories: ['classic', 'junior'], podium: [],
  participants: [{
    id: '99999999-9999-4999-8999-999999999999',
    registrationId: '22222222-2222-4222-8222-222222222222',
    category: 'junior', startNumber: 42, firstName: 'Sara', lastName: 'Bianchi',
    projectName: 'Stella', photo: '', imagePath: '', voteCount: 0, averageScore: 0, active: true
  }]
};

/* Tylko do zrzutów: `?openroster=1` rozwija listę samo, bo `cdp.mjs shot` nie umie kliknąć.
   Pod parametrem, żeby nie wchodzić w drogę sondzie — ta klika sama i podwójne kliknięcie
   zamknęłoby jej listę tuż przed pomiarem. */
if (new URLSearchParams(location.search).has('openroster')) {
  window.addEventListener('load', () => {
    setTimeout(() => {
      const button = [...document.querySelectorAll('button')]
        .find((el) => /lista di partenza|listy startowej/.test(el.textContent));
      if (button) button.click();
    }, 900);
  });
}

window.fetch = async (url, options = {}) => {
  const path = String(url);
  let body = {};
  try { body = JSON.parse(options.body || '{}'); } catch { /* nieważne dla zaślepki */ }
  window.__sent.push({ path, body });

  const reply = (data) =>
    new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

  if (path.includes('/inbox')) return reply({ ok: true, counts: {} });
  if (path.includes('/roster')) return reply({ ok: true, rows: roster });
  if (path.includes('/voting-admin')) return reply(votingState);
  return reply({ ok: true });
};
