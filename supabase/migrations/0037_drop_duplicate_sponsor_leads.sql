/* ---------------------------------------------------------------------------
   Cofniecie 0036: dwie tabele na jedna rzecz.
   ---------------------------------------------------------------------------
   0036 zalozylo `sponsor_leads`, a 0035 - `sponsor_submissions`. Obie opisuja to
   samo: zgloszenie sponsora z czatu, ze stanem pending/approved/rejected. Powstaly
   rownolegle, w tej samej turze pracy, i to jest cala przyczyna.

   Zostaje `sponsor_submissions`, bo to ona ma za soba kod: `sponsorLeads`,
   `sponsorLeadApprove` i `sponsorLeadReject` w worker/index.js oraz
   src/admin/lib/sponsorLeads.ts czytaja i pisza wylacznie do niej. `sponsor_leads`
   nie byla czytana ani zapisywana przez ani jedna linie - byla tabela-sierota.

   DLACZEGO USUNIECIE, A NIE ZOSTAWIENIE "NA WSZELKI WYPADEK"
     Pusta tabela o myslacej nazwie jest gorsza niz jej brak: przy nastepnym pytaniu
     "gdzie sa zgloszenia sponsorow" da odpowiedz "tu nic nie ma", ktora wyglada jak
     usterka zapisu, a nie jak nieuzywana tabela. Sprawdzone przed usunieciem w
     produkcji: zero wierszy po obu stronach.

   0036 ZOSTAJE W HISTORII. Migracji sie nie przepisuje - baza, ktora juz przez nia
   przeszla, musi dostac to cofniecie jako osobny krok, a nie znalezc pusty plik
   tam, gdzie wczoraj cos bylo.
   --------------------------------------------------------------------------- */

drop table if exists public.sponsor_leads;
