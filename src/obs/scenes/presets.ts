export const VOTE_URL = 'https://www.carruleddhishow.com/votazione';
export const CAMERA = { x: 544, y: 80, width: 1280, height: 720 } as const;

export type SceneId = 'starting' | 'intro' | 'break' | 'voting' | 'results' | 'standby' | 'ending';
export interface ScenePreset {
  label: string;
  labelPl: string;
  theme: 'yellow' | 'blue' | 'coral' | 'cream';
  kicker: [string, string];
  title: [string[], string[]];
  description: [string, string];
  footnote: [string, string];
}

export const SCENES: Record<SceneId, ScenePreset> = {
  starting: { label: 'Starting', labelPl: 'Zaraz zaczynamy', theme: 'yellow',
    kicker: ['CI SIAMO QUASI', 'JUŻ ZA CHWILĘ'], title: [['TRA POCO', 'SI PARTE.'], ['ZA CHWILĘ', 'START!']],
    description: ['Ruote pronte. Cuori accesi. Lo show sta per cominciare.', 'Koła gotowe, emocje rosną. Za chwilę rozpoczynamy transmisję.'],
    footnote: ['RESTA CON NOI', 'ZOSTAŃ Z NAMI'] },
  intro: { label: 'Intro', labelPl: 'Otwarcie', theme: 'coral',
    kicker: ['BENVENUTI ALLO SHOW', 'WITAMY NA SHOW'], title: [['TUTTI', 'IN DISCESA!'], ['WSZYSCY', 'NA START!']],
    description: ['Creatività, coraggio e una strada piena di storie.', 'Pomysłowość, odwaga i trasa pełna niezwykłych historii.'],
    footnote: ['FACCIAMOCI SENTIRE', 'ZACZYNAMY WSPÓLNIE'] },
  break: { label: 'Break', labelPl: 'Przerwa', theme: 'blue',
    kicker: ['UN ATTIMO DI RESPIRO', 'CHWILA ODDECHU'], title: [['PICCOLA', 'PAUSA.'], ['KRÓTKA', 'PRZERWA.']],
    description: ['Torniamo tra poco. La strada ha ancora molto da raccontare.', 'Wracamy za chwilę. Przed nami jeszcze wiele emocji.'],
    footnote: ['LO SHOW CONTINUA', 'SHOW TRWA DALEJ'] },
  voting: { label: 'Voting', labelPl: 'Głosowanie', theme: 'yellow',
    kicker: ['PREMIO DEL PUBBLICO', 'NAGRODA PUBLICZNOŚCI'], title: [['IL TUO', 'VOTO', 'CONTA.'], ['TWÓJ', 'GŁOS SIĘ', 'LICZY.']],
    description: ['Scegli il carruleddhu che ti ha conquistato. Il protagonista sei anche tu.', 'Wybierz pojazd, który zdobył Twoje serce. Ty też tworzysz to wydarzenie.'],
    footnote: ['SCANSIONA. SCEGLI. PARTECIPA.', 'ZESKANUJ. WYBIERZ. ZAGŁOSUJ.'] },
  results: { label: 'Results', labelPl: 'Wyniki', theme: 'cream',
    kicker: ['PREMIO DEL PUBBLICO', 'NAGRODA PUBLICZNOŚCI'], title: [['IL VOSTRO', 'PODIO.'], ['WASZE', 'PODIUM.']],
    description: ['I protagonisti scelti dal pubblico.', 'Uczestnicy wybrani przez publiczność.'],
    footnote: ['APPLAUSI PER TUTTI', 'BRAWA DLA WSZYSTKICH'] },
  standby: { label: 'Standby', labelPl: 'Oczekiwanie', theme: 'blue',
    kicker: ['STIAMO PREPARANDO LA DIRETTA', 'PRZYGOTOWUJEMY TRANSMISJĘ'], title: [['RESTA', 'CON NOI.'], ['ZOSTAŃ', 'Z NAMI.']],
    description: ['Un nuovo passaggio, una nuova storia. Ripartiamo tra poco.', 'Kolejny przejazd, kolejna historia. Za chwilę wracamy.'],
    footnote: ['CI VEDIAMO TRA POCO', 'DO ZOBACZENIA ZA CHWILĘ'] },
  ending: { label: 'Ending', labelPl: 'Zakończenie', theme: 'coral',
    kicker: ['CHE GIORNATA!', 'CO ZA DZIEŃ!'], title: [['GRAZIE,', 'GALLURA.'], ['DZIĘKUJEMY', 'ZA EMOCJE!']],
    description: ['Ai piloti, al pubblico e a chi rende possibile tutto questo: grazie di cuore.', 'Uczestnikom, widzom i wszystkim, którzy tworzą to wydarzenie: dziękujemy!'],
    footnote: ['ALLA PROSSIMA DISCESA', 'DO NASTĘPNEGO ZJAZDU'] },
};

export const EFFECTS = [
  { id: 'confetti', label: 'Confetti', labelPl: 'Konfetti' },
  { id: 'ribbons', label: 'Ribbons', labelPl: 'Wstążki' },
  { id: 'sparkles', label: 'Stars', labelPl: 'Gwiazdki' },
] as const;
