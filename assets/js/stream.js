/**
 * Transmisja na żywo — część na stronie głównej.
 * ===========================================================================
 *
 * Robi cztery rzeczy i nic poza nimi:
 *
 *   1. pyta serwer, czy transmisja trwa, i dopiero na TAK odsłania sekcję z odtwarzaczem
 *      oraz trzy zaproszenia do niej (hero, pasek, menu);
 *   2. wpisuje adres do ramki przy włączeniu i ZDEJMUJE go przy wyłączeniu;
 *   3. zbiera stuknięcia w obraz — serca lecą w górę, licznik jest wspólny dla wszystkich;
 *   4. na telefonie obróconym poziomo rozkłada odtwarzacz na cały ekran.
 *
 * O TYM, CZY TRANSMISJA TRWA, DECYDUJE SERWER — TAK JAK O FAZIE GŁOSOWANIA
 *   Ten plik nie zna godziny startu i nie zgaduje jej z zegara przeglądarki. Pyta i rysuje
 *   odpowiedź. Zegar w telefonie bywa przestawiony o godzinę, a organizator naciska „otwórz"
 *   wtedy, kiedy naprawdę zaczyna — a to bywa dwadzieścia minut po planie.
 *
 * DLACZEGO ODPYTYWANIE, A NIE GNIAZDO
 *   Przez jedenaście miesięcy w roku odpowiedź brzmi „nie trwa" i jest to jedno zapytanie na
 *   wejście na stronę. W dniu wyścigu odpytujemy częściej, ale tylko przy otwartej karcie i
 *   tylko przy trwającej transmisji. Stałe połączenie dla ośmiu bajtów odpowiedzi kosztowałoby
 *   więcej niż to, co przez nie płynie — a Worker i tak stoi na żądaniach, nie na gnieździe.
 */
import { $, $$, api, config, demoMode, reducedMotion, text } from './voting-core.js';

(function () {
  'use strict';

  const section = $('[data-stream-section]');
  if (!section) return;

  /* Odpytywanie: rzadko, gdy nic się nie dzieje, i gęsto, gdy trwa.
     ---------------------------------------------------------------------------
     Zamknięta transmisja zmienia się raz na rok, otwarta — licznik serc rośnie co sekundę.
     Jedna wartość pośrodku byłaby albo marnowaniem zapytań przez jedenaście miesięcy, albo
     licznikiem, który zauważa cudze brawa dopiero po minucie. */
  /* Dwadziescia sekund, nie minuta. Tyle najdluzej czeka ktos, kto ma strone otwarta,
     zanim zobaczy, ze transmisja ruszyla. Minuta to bylo za dlugo — organizator wlacza
     i patrzy na wlasna strone, na ktorej przez pol minuty nic sie nie dzieje. */
  const POLL_CLOSED_MS = 20_000;
  const POLL_LIVE_MS = 6_000;
  /* Stuknięcia zbierają się w paczkę i lecą jednym zapytaniem. Człowiek stuka pięć razy w
     sekundę; pięć zapytań na sekundę razy stu oglądających to nie jest licznik, to atak na
     własny serwer. Worker i tak przycina paczkę do dwudziestu — patrz `streamHeart`. */
  const CLAP_FLUSH_MS = 900;
  const CLAP_MAX = 20;

  const frame = $('[data-stream-frame]', section);
  const stage = $('[data-stream-stage]', section);
  const tapLayer = $('[data-stream-tap]', section);
  const heartLayer = $('[data-stream-hearts]', section);
  const bar = $('[data-stream-bar]', section);
  const countLabel = $('[data-stream-count]', section);
  const viewersLabel = $('[data-stream-viewers]', section);

  /* IDENTYFIKATOR KARTY, NIE CZLOWIEKA.
     ---------------------------------------------------------------------------
     Losowy ciag na czas zycia karty. Idzie z kazdym odpytaniem o stan — tym samym,
     ktore i tak leci co szesc sekund — i sluzy wylacznie do policzenia, ile kart jest
     teraz otwartych. `sessionStorage`, a nie `localStorage`: ma zginac razem z karta,
     bo liczymy obecnosc TERAZ, a nie „kiedys tu byl".

     W trybie prywatnym `sessionStorage` potrafi rzucic wyjatkiem — wtedy identyfikator
     zyje w zmiennej, czyli do pierwszego odswiezenia. Gorzej niz nic? Nie: licznik nadal
     dziala, tylko odswiezenie strony liczy sie jako nowa karta. Wywrocony skrypt
     transmisji bylby duzo gorszy. */
  const viewerId = (() => {
    const nowy = () => 'v' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
    try {
      const zapisany = sessionStorage.getItem('carruleddhi.viewer');
      if (zapisany) return zapisany;
      const swiezy = nowy();
      sessionStorage.setItem('carruleddhi.viewer', swiezy);
      return swiezy;
    } catch (_) {
      return nowy();
    }
  })();
  const nameLine = $('[data-stream-name]', section);

  let live = false;
  let embed = '';

  /* LICZNIK SERC: SERWEROWA LICZBA PLUS TO, CO JESZCZE DO NIEGO NIE DOLECIAŁO.
     ---------------------------------------------------------------------------
     Trzy liczby zamiast jednej, i każda odpowiada na inne pytanie:

       hearts    ile naliczył serwer — jedyna prawda, wspólna dla wszystkich oglądających;
       pending   moje stuknięcia, które czekają na wysyłkę;
       inFlight  moje stuknięcia, które właśnie lecą i nie ma ich jeszcze w `hearts`.

     Na ekranie stoi ich suma. Dzięki temu licznik podskakuje pod palcem natychmiast (licznik,
     który rusza dopiero po locie tam i z powrotem, czyta się jak zepsuty przycisk), a przy
     każdej odpowiedzi serwera wraca do prawdy, ZAMIAST się z nią rozjeżdżać.

     Wcześniej stała tu jedna liczba pilnowana przez `Math.max`, żeby nie drgała w dół. To
     działało do chwili, w której organizator naciska „Wyzeruj licznik" w panelu: serwer
     mówił 0, `Math.max` zostawiał starą wartość i licznik na stronie zostawał na niej
     DO KOŃCA TRANSMISJI, bez sposobu na powrót. */
  let hearts = 0;
  let pending = 0;
  let inFlight = 0;
  let flushTimer = 0;
  let pollTimer = 0;

  /* ------------------------------------------------------------------ rozmowa z serwerem */

  /* `viewerId` tylko przy odczycie stanu. Przy oklaskach nie ma po co — ten sam licznik
     obecnosci odswieza sie sekunde pozniej zwyklym odpytaniem. */
  async function ask(type, body = {}) {
    if (type === 'stream') body = { ...body, viewerId };
    const bridge = api();
    const endpoint = config()?.endpoints?.[type === 'stream-heart' ? 'streamHeart' : 'stream'];
    if (!bridge || !endpoint) return null;
    try {
      const result = await bridge.post(endpoint, bridge.payload(type, body));
      return result?.ok ? result : null;
    } catch (error) {
      /* Cicho. Brak sieci w tłumie przy trasie jest normalny, a komunikat „nie udało się
         odczytać stanu transmisji" co sześć sekund byłby gorszy niż sama przerwa. */
      console.warn('Stream state unavailable:', error);
      return null;
    }
  }

  /* --------------------------------------------------------------------------- rysowanie */

  /* ==========================================================================
     DZWIEK
     ==========================================================================
     Obraz rusza wyciszony, bo inaczej nie ruszylby wcale: zadna przegladarka nie pozwoli
     odtworzyc dzwieku, dopoki czlowiek czegos nie dotknie. To nie jest ustawienie do
     zmiany — to warunek, ktory trzeba obejsc, a nie wylaczyc.

     Obejscie jest jedno i uczciwe: widoczny przycisk. Dotkniecie go JEST tym gestem,
     ktorego brakowalo, wiec od tej chwili dzwiek jest dozwolony.

     Polecenie idzie przez `postMessage` do odtwarzacza YouTube, nie przez podmiane adresu
     ramki — podmiana zaczelaby film od nowa, a przy transmisji na zywo oznaczaloby to
     przeskok do biezacej chwili i sekunde czarnego ekranu. `unMute` i `setVolume` docieraja
     do juz grajacego odtwarzacza i nic nie przerywaja.

     `*` jako adres docelowy wiadomosci: ramka bywa na youtube.com albo youtube-nocookie.com
     zaleznie od tego, co zwrocil Worker, a wiadomosc nie niesie niczego, czego nie moglby
     zobaczyc ktokolwiek — to polecenie „odcisz", nie dane. */
  let dzwiekWlaczony = false;

  function slijDoOdtwarzacza(polecenie, argumenty = []) {
    try {
      frame?.contentWindow?.postMessage(JSON.stringify({
        event: 'command', func: polecenie, args: argumenty
      }), '*');
      return true;
    } catch (_) {
      return false;
    }
  }

  function odmalujDzwiek() {
    const guzik = $('[data-stream-sound]', section);
    if (!guzik) return;
    guzik.setAttribute('aria-pressed', String(dzwiekWlaczony));
    $('[data-sound-off]', guzik)?.toggleAttribute('hidden', dzwiekWlaczony);
    $('[data-sound-on]', guzik)?.toggleAttribute('hidden', !dzwiekWlaczony);
    const napis = $('[data-stream-sound-label]', guzik);
    if (napis) {
      const klucz = dzwiekWlaczony ? 'stream.soundOff' : 'stream.soundOn';
      napis.setAttribute('data-i18n', klucz);
      /* Napis przepisywany od razu, a nie dopiero przy nastepnej zmianie jezyka: to jest
         odpowiedz na dotkniecie i ma byc widoczna w tej samej chwili. */
      /* Slownik biezacego jezyka prosto z i18n.js. Jezyk czytany z `lang` na dokumencie —
         to tam applyLanguage() go zapisuje, wiec jest jedno zrodlo prawdy i nie trzeba go
         tu sledzic osobno. Gdy czegos brakuje, napis zostaje ten, ktory byl: `data-i18n`
         wyzej i tak zostal juz przestawiony, wiec najblizsza zmiana jezyka to naprawi. */
      const jezyk = document.documentElement.getAttribute('lang') || 'it';
      const slownik = window.CARRULEDDHI_I18N?.[jezyk] || window.CARRULEDDHI_I18N?.it;
      if (slownik && slownik[klucz]) napis.textContent = slownik[klucz];
    }
  }

  function przelaczDzwiek() {
    if (!live) return;
    dzwiekWlaczony = !dzwiekWlaczony;
    if (dzwiekWlaczony) {
      slijDoOdtwarzacza('unMute');
      slijDoOdtwarzacza('setVolume', [100]);
    } else {
      slijDoOdtwarzacza('mute');
    }
    odmalujDzwiek();
  }

  function paintCount() {
    if (!countLabel) return;
    const label = String(hearts + pending + inFlight);
    if (countLabel.textContent !== label) countLabel.textContent = label;
  }

  /* Liczba ogladajacych. Nigdy nie schodzi ponizej jednego, gdy transmisja trwa: sam
     patrzacy na te liczbe jest juz jednym z nich, a „0 oglada" na wlasnym ekranie czyta
     sie jak awaria licznika. */
  function paintViewers(ile) {
    if (!viewersLabel) return;
    const label = String(Math.max(1, Number(ile) || 0));
    if (viewersLabel.textContent !== label) viewersLabel.textContent = label;
  }

  /* OBRAZ RUSZA, GDY SEKCJA WCHODZI NA EKRAN — NIE WCZESNIEJ.
     ---------------------------------------------------------------------------
     Wczesniej `src` ramki byl ustawiany w chwili, gdy serwer powiedzial „transmisja trwa",
     czyli czesto wtedy, gdy sekcja byla jeszcze kilka ekranow nizej. Odtwarzacz ciagnal
     wtedy wideo do niewidocznego elementu — na danych komorkowych to jest realny koszt
     dla kogos, kto do tej sekcji nigdy nie dojdzie.

     Teraz ladowanie czeka na `IntersectionObserver`. Przy okazji jest to dokladnie to,
     o co proszono: obraz zaczyna sie sam, gdy sie do niego przewinie.

     `mute=1` NIE JEST WYBOREM STYLU. Zadna przegladarka nie pozwoli uruchomic dzwieku bez
     gestu czlowieka — bez wyciszenia autostart po prostu NIE ZADZIALA i zostanie plansza
     z trojkatem. Z wyciszeniem obraz rusza od razu, a dzwiek wlacza sie jednym
     kliknieciem w odtwarzaczu.

     `rootMargin` z zapasem 200 px: ladowanie zaczyna sie chwile PRZED wejsciem sekcji
     w kadr, wiec do momentu, gdy czlowiek na nia patrzy, obraz zdazyl juz ruszyc. To jest
     cala tajemnica „plynnosci" — nie krotsza animacja, tylko wczesniejszy start. */
  let obrazPokazany = false;
  let obserwatorSceny = null;

  function wlaczObraz() {
    if (obrazPokazany || !live || !embed) return;
    obrazPokazany = true;
    /* `enablejsapi=1` jest tym, co pozwala pozniej WLACZYC DZWIEK bez przeladowania.
       Bez tego parametru odtwarzacz nie sluchа polecen z naszej strony i jedyna droga do
       dzwieku byloby podmienienie adresu ramki, czyli start filmu od nowa. */
    const zWyciszeniem = embed + (embed.includes('?') ? '&' : '?')
      + 'mute=1&playsinline=1&enablejsapi=1';
    frame.setAttribute('src', zWyciszeniem);
    stage?.classList.add('is-playing');
    /* Nowy odtwarzacz zaczyna wyciszony, wiec stan przycisku wraca do „wlacz dzwiek".
       Bez tego po zmianie zrodla przycisk twierdzilby, ze dzwiek jest, a go nie ma. */
    dzwiekWlaczony = false;
    odmalujDzwiek();
  }

  function pokazObraz() {
    obrazPokazany = false;
    stage?.classList.remove('is-playing');
    if (!('IntersectionObserver' in window)) { wlaczObraz(); return; }
    obserwatorSceny?.disconnect();
    obserwatorSceny = new IntersectionObserver((wpisy) => {
      if (wpisy.some((w) => w.isIntersecting)) {
        wlaczObraz();
        obserwatorSceny?.disconnect();
        obserwatorSceny = null;
      }
    }, { rootMargin: '200px 0px' });
    obserwatorSceny.observe(stage || section);
  }

  $('[data-stream-sound]', section)?.addEventListener('click', przelaczDzwiek);

  function paint(state) {
    /* BRAK ODPOWIEDZI TO NIE JEST „TRANSMISJA SIĘ SKOŃCZYŁA".
       ---------------------------------------------------------------------------
       `ask()` oddaje `null` przy zerwanej sieci, a to w tłumie przy trasie zdarza się co
       chwilę. Bez tego warunku jedno nieudane zapytanie zwijałoby sekcję i gasiło obraz
       w środku zjazdu — komu innemu wygląda to na koniec transmisji. Zamknięcie ogłasza
       serwer odpowiedzią `live: false`, a nie cisza. */
    if (!state) return;

    const nowLive = Boolean(state.live && state.embed);
    if (nowLive) paintViewers(state.viewers);
    hearts = Number(state.hearts) || 0;
    paintCount();

    /* Nazwa transmisji wchodzi w OSOBNY wiersz, a nie na miejsce zdania z instrukcją: to
       zdanie jest jedynym miejscem, z którego ktokolwiek dowiaduje się o stukaniu w obraz.
       Pusty łańcuch, gdy organizator nazwy nie wpisał — `:empty` w live.css zwija wtedy
       wiersz do zera, więc nie zostaje po nim odstęp. */
    if (nameLine) nameLine.textContent = state.title || '';

    if (nowLive === live && state.embed === embed) return;

    live = nowLive;
    embed = state.embed || '';

    section.hidden = !live;
    $$('[data-stream-cta]').forEach((cta) => { cta.hidden = !live; });

    if (frame) {
      /* Adres wpisywany przy włączeniu i zdejmowany przy wyłączeniu. `removeAttribute`, a nie
         `src = ''`: pusty łańcuch jest w części przeglądarek adresem samej strony i ramka
         wczytałaby stronę główną SAMA W SOBIE, rekurencyjnie. */
      if (live) pokazObraz();
      else frame.removeAttribute('src');
    }

    if (!live) {
      leaveFullscreen();
      document.documentElement.removeAttribute('data-stream-live');
    } else {
      document.documentElement.setAttribute('data-stream-live', '');
    }
  }

  /* ------------------------------------------------------------------------------- serca */

  /**
   * Jedno serce lecące w górę.
   *
   * Rysowane z JavaScriptu i usuwane po animacji, a nie trzymane w puli: przy stukaniu pięć
   * razy na sekundę pula i tak by się wyczerpała, a każdy element żyje półtorej sekundy.
   * Przy `prefers-reduced-motion` nie ma serc w ogóle — sam licznik rośnie tak samo.
   */
  function spawnHeart(x, y) {
    if (!heartLayer || reducedMotion) return;
    /* Sufit na liczbę serc naraz. Bez niego dwadzieścia palców na jednym ekranie daje kilkaset
       elementów w drzewie i telefon zaczyna gubić klatki — czyli dokładnie w chwili, w której
       ma być najładniej. */
    if (heartLayer.childElementCount > 28) return;
    const heart = document.createElement('span');
    heart.className = 'live-heart';
    /* Rozrzut w bok i obrót, żeby dwa serca z tego samego miejsca nie leciały jednym torem. */
    heart.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 90)}px`);
    heart.style.setProperty('--tilt', `${Math.round((Math.random() - 0.5) * 40)}deg`);
    heart.style.setProperty('--scale', (0.72 + Math.random() * 0.6).toFixed(2));
    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    heart.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.6-4.7-9.6-9.1C.8 8.3 2.8 5 6.2 5c2 0 3.4 1.1 4.3 2.3l.7.9.7-.9C12.8 6.1 14.2 5 16.2 5c3.4 0 5.4 3.3 3.8 6.9C17.9 16.3 12 21 12 21Z"/></svg>';
    heartLayer.appendChild(heart);
    heart.addEventListener('animationend', () => heart.remove(), { once: true });
  }

  async function flushClaps() {
    flushTimer = 0;
    const count = Math.min(pending, CLAP_MAX);
    if (!count) return;
    pending -= count;
    inFlight += count;
    const result = await ask('stream-heart', { count });
    inFlight -= count;
    /* Odpowiedź NOSI nową sumę, więc bierzemy ją zamiast dodawać sobie samemu — w tej
       liczbie są już cudze brawa z ostatniej sekundy. Przy nieudanej wysyłce nie robimy nic:
       te stuknięcia przepadają, i to jest właściwe zachowanie, bo alternatywą jest kolejka
       braw, która po odzyskaniu sieci wysypuje trzydzieści serc naraz. */
    if (result) hearts = Number(result.hearts) || hearts;
    paintCount();
    /* Reszta paczki, jeśli ktoś stukał szybciej niż dwadzieścia razy na dziewięćset
       milisekund. Idzie następną turą, a nie ginie. */
    if (pending > 0 && !flushTimer) flushTimer = window.setTimeout(flushClaps, CLAP_FLUSH_MS);
  }

  function clap(x, y) {
    if (!live) return;
    spawnHeart(x, y);
    pending += 1;
    paintCount();
    if (!flushTimer) flushTimer = window.setTimeout(flushClaps, CLAP_FLUSH_MS);
  }

  if (tapLayer) {
    /* `pointerdown`, nie `click`: stukanie ma odpowiadać pod palcem, a nie po podniesieniu
       go, i ma działać przy szybkim serialnym stukaniu, którego `click` nie nadąża zliczać.
       Bez `preventDefault` — na tej warstwie nie ma czego anulować, a anulowanie zdarzenia
       dotyku zabrałoby przewijanie strony palcem po obrazie. */
    tapLayer.addEventListener('pointerdown', (event) => {
      const box = stage.getBoundingClientRect();
      clap(event.clientX - box.left, event.clientY - box.top);
      showBar();
    });
  }

  /* Ta sama czynność z klawiatury. Warstwa do stukania jest `aria-hidden` i nie da się na nią
     wejść tabulatorem — gest nie jest przyciskiem. Ten przycisk jest. */
  $('[data-stream-clap]', section)?.addEventListener('click', () => {
    const box = stage.getBoundingClientRect();
    clap(box.width / 2, box.height * 0.72);
  });

  /* ------------------------------------------------------------------------ pasek na obrazie */

  let barTimer = 0;
  function showBar() {
    stage?.classList.add('is-showing-bar');
    window.clearTimeout(barTimer);
    barTimer = window.setTimeout(() => stage?.classList.remove('is-showing-bar'), 3200);
  }
  /* Bez `stopPropagation` na pasku: on nie jest przodkiem warstwy braw, więc naciśnięcie
     przycisku i tak nigdy do niej nie docierało. Tym, co zabierało brawa, było samo pudełko
     paska leżące na obrazie — i to rozstrzyga teraz `pointer-events` w live.css. */
  stage?.addEventListener('pointerenter', showBar);

  /* --------------------------------------------------------------------------- pełny ekran */

  /**
   * Pełny ekran — prawdziwy, jeśli przeglądarka pozwoli, a rozłożony na okno, jeśli nie.
   *
   * DLACZEGO DWA SPOSOBY, A NIE JEDEN
   *   `requestFullscreen()` wymaga świeżego gestu użytkownika. Naciśnięcie przycisku nim jest
   *   i wtedy dostajemy prawdziwy pełny ekran. OBRÓCENIE TELEFONU NIM NIE JEST — przeglądarka
   *   odrzuca wtedy prośbę i nie da się tego obejść, bo to jest zabezpieczenie, a nie usterka.
   *   Gdyby to była jedyna droga, obrócenie telefonu nie robiłoby nic i wyglądałoby na błąd.
   *
   *   Dlatego przy obrocie rozkładamy odtwarzacz na całe okno klasą CSS: `position: fixed`
   *   przez cały ekran. Wygląda tak samo, działa zawsze i zdejmuje się tym samym gestem.
   *   iPhone dodatkowo w ogóle nie zna pełnego ekranu dla elementów innych niż wideo — tam ta
   *   droga jest JEDYNĄ, jaka istnieje.
   */
  const supportsFullscreen = typeof stage?.requestFullscreen === 'function';

  /**
   * Przodkowie, którzy nie pozwalają rozłożyć odtwarzacza na całe okno.
   *
   * `position: fixed` przestaje znaczyć „względem okna", gdy nad elementem stoi przodek
   * z którąś z tych własności. Dwie przeszkody, obie zmierzone na 844×390:
   *
   *   PRZEKSZTAŁCENIE  `transform`, `filter`, `perspective` przenoszą punkt odniesienia na
   *                    siebie. Sekcje tej strony są przypinane przekształceniem.
   *   PRZYCIĘCIE       `overflow: clip` na `#live` (z `.section-card`), `clip-path` i
   *                    `contain: paint` przycinają nawet potomka `fixed`.
   *   WŁASNY KONTEKST  `isolation: isolate` na `#live` i `#main`, ale też samo
   *                    `position: sticky` + `z-index: 2` na `#live` — pozycjonowany element
   *                    z numerem ZAKŁADA własną warstwę i zamyka w niej `z-index: 9999`
   *                    odtwarzacza. Numer przestaje wtedy znaczyć cokolwiek wobec sekcji,
   *                    które w tym samym stosie paneli mają numery wyższe niż 2 i malują się
   *                    NA odtwarzaczu. Dlatego oprócz zdejmowania własności PODNOSIMY numer
   *                    każdemu pozycjonowanemu przodkowi — patrz `PODNIESIONY` niżej.
   *
   * Wszystkie trzy przeszkody dają na ekranie ten sam obraz i dlatego trzeba było ich szukać
   * po kolei: zmierzone na 844×390 pudełko odtwarzacza pokazywało już całe okno (844×390 od 0),
   * a mimo to widać było czarny obraz do 62% wysokości i niebieską stopkę pod spodem.
   *
   * Wszystko zdejmujemy inline i przywracamy przy wyjściu. Inline, a nie klasą: nie wiadomo
   * z góry, ilu tych przodków jest ani którą z siedmiu własności ma który, a reguła
   * z `!important` po całej drodze trafiałaby też w sekcje, o które tu nie chodzi.
   */
  const BLOKUJACE = ['transform', 'filter', 'perspective', 'overflow', 'clipPath', 'contain', 'isolation'];
  const OBOJETNE = {
    transform: 'none', filter: 'none', perspective: 'none',
    overflow: 'visible', clipPath: 'none', contain: 'none', isolation: 'auto'
  };

  /* Wyżej niż cokolwiek na tej stronie, ale nie `2147483647`: zostawiamy zapas, żeby coś,
     co MA być nad odtwarzaczem (okno zgody, komunikat), dało się jeszcze podnieść. */
  const PODNIESIONY = '2147480000';

  let zdjete = [];

  function odepnijPrzodkow() {
    zdjete = [];
    for (let node = stage?.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      const winne = BLOKUJACE.filter((name) => style[name] !== OBOJETNE[name]);
      /* Pozycjonowany przodek z numerem zakłada własną warstwę i zamyka w niej wszystko,
         co pod nim. Nie da się tego cofnąć bez ruszania układu, więc zamiast tego CAŁA ta
         warstwa idzie na wierzch — skutek jest ten sam, a strona pod spodem stoi, gdzie stała. */
      const wlasnaWarstwa = style.position !== 'static' && style.zIndex !== 'auto';
      if (!winne.length && !wlasnaWarstwa) continue;
      const zapas = {};
      winne.forEach((name) => {
        zapas[name] = node.style[name];
        node.style[name] = OBOJETNE[name];
      });
      if (wlasnaWarstwa) {
        zapas.zIndex = node.style.zIndex;
        node.style.zIndex = PODNIESIONY;
      }
      zdjete.push({ node, zapas });
    }
  }

  function przypnijPrzodkow() {
    zdjete.forEach(({ node, zapas }) => {
      Object.keys(zapas).forEach((name) => { node.style[name] = zapas[name]; });
    });
    zdjete = [];
  }

  function enterFullscreen(fromGesture) {
    if (!stage) return;
    if (fromGesture && supportsFullscreen && !document.fullscreenElement) {
      /* Prawdziwy pełny ekran wyjmuje element z układu strony, więc przekształceń przodków
         nie trzeba ruszać — i nie ruszamy ich, bo każda taka zmiana to jedna rzecz więcej
         do cofnięcia. Dopiero gdy przeglądarka odmówi, schodzimy na rozłożenie na okno. */
      stage.requestFullscreen().catch(() => { odepnijPrzodkow(); stage.classList.add('is-faux-full'); });
      return;
    }
    odepnijPrzodkow();
    stage.classList.add('is-faux-full');
  }

  function leaveFullscreen() {
    stage?.classList.remove('is-faux-full');
    przypnijPrzodkow();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  function fullscreenOn() {
    return Boolean(document.fullscreenElement) || Boolean(stage?.classList.contains('is-faux-full'));
  }

  $('[data-stream-full]', section)?.addEventListener('click', () => {
    if (fullscreenOn()) leaveFullscreen();
    else enterFullscreen(true);
  });

  /* Escape zamyka także ten rozłożony na okno. Prawdziwy pełny ekran zamyka przeglądarka
     sama, ale nasz jest zwykłym elementem strony i bez tego zostałby na ekranie. */
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && stage?.classList.contains('is-faux-full')) leaveFullscreen();
  });

  /* ------------------------------------------------------------- obrót telefonu = pełny ekran */

  /**
   * Poziomo — odtwarzacz na cały ekran. Pionowo — z powrotem do strony.
   *
   * Warunek „sekcja jest na ekranie" jest tu istotny: bez niego obrócenie telefonu przy
   * czytaniu regulaminu dwa ekrany niżej wrzucałoby na twarz odtwarzacz, którego nikt nie
   * prosił. Sprawdzamy widoczność obserwatorem, a nie liczeniem przy każdym obrocie — obrót
   * zdarza się rzadko, ale odczyt geometrii w jego trakcie trafia w środek przeliczania układu.
   */
  let sectionVisible = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => { sectionVisible = entry.isIntersecting; });
    }, { threshold: 0.35 }).observe(section);
  }

  const landscape = window.matchMedia('(orientation: landscape)');
  const coarse = window.matchMedia('(pointer: coarse)');

  function onOrientation() {
    /* Tylko na dotyku. Na komputerze „orientacja pozioma" to zwykłe okno i każde otwarcie
       strony na laptopie kończyłoby się odtwarzaczem na całym ekranie. */
    if (!coarse.matches || !live) return;
    if (landscape.matches) {
      if (sectionVisible && !fullscreenOn()) enterFullscreen(false);
    } else if (stage?.classList.contains('is-faux-full')) {
      /* Z powrotem do pionu — schodzimy. Zdejmujemy tylko TEN rozłożony na okno: jeśli ktoś
         wszedł w prawdziwy pełny ekran przyciskiem, to była jego decyzja i obrót telefonu jej
         nie cofa. */
      leaveFullscreen();
    }
  }

  /* `matchMedia` zamiast `orientationchange`: to drugie jest przestarzałe, nie ma go na
     części przeglądarek desktopowych i na iOS potrafi odpalić przed przeliczeniem układu. */
  landscape.addEventListener?.('change', onOrientation);

  /* ---------------------------------------------------------------------------- udostępnij */

  const shareButton = $('[data-stream-share]', section);
  if (shareButton && navigator.share) {
    shareButton.hidden = false;
    shareButton.addEventListener('click', async () => {
      try {
        await navigator.share({
          title: document.title,
          text: text('stream.shareText'),
          url: `${window.location.origin}${window.location.pathname}#live`
        });
      } catch {
        /* Zamknięte okno wyboru to nie błąd — nic nie mówimy. */
      }
    });
  }

  /* --------------------------------------------------------------------------- odpytywanie */

  async function tick() {
    if (!document.hidden) {
      if (demoMode) paint({ live: true, hearts, title: '', embed: 'about:blank' });
      else paint(await ask('stream'));
    }
    pollTimer = window.setTimeout(tick, live ? POLL_LIVE_MS : POLL_CLOSED_MS);
  }

  /* Karta wróciła na wierzch — pytamy od razu, nie po sześćdziesięciu sekundach. Ktoś, kto
     wraca do karty w chwili startu, ma zobaczyć transmisję, a nie stronę sprzed minuty. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    window.clearTimeout(pollTimer);
    tick();
  });

  tick();
})();
