import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pole daty i godziny: własne na myszy, systemowe pod palcem.
 * ============================================================================
 * DLACZEGO NIE JEDNO ALBO DRUGIE
 *   `<input type="datetime-local">` otwiera widget przeglądarki, którego nie da się
 *   ostylować — to nie jest element strony, tylko okno systemowe. Widać to na panelu jako
 *   czarny kalendarz **po polsku w środku włoskiego panelu**, bo idzie za językiem
 *   przeglądarki, a nie za wyborem w panelu. Tego nie naprawia żaden CSS.
 *
 *   Ale zastąpienie go wszędzie byłoby pogorszeniem tam, gdzie ten panel jest naprawdę
 *   używany: organizator ustawia termin z telefonu, na zboczu, w dniu zawodów. Systemowy
 *   wybór daty na telefonie ma duże pola trafienia i bębny do przewijania; własny, zrobiony
 *   z przycisków 32 px, jest przy tym gorszy — i to jest ta różnica, której nie widać na
 *   komputerze, na którym się go pisze.
 *
 *   Więc rozstrzyga `pointer: coarse`, czyli „urządzenie wskazujące jest grube" — palec, nie
 *   kursor. Nie szerokość okna: wąskie okno na komputerze to nadal mysz, a tablet z rysikiem
 *   bywa szeroki. Zapytanie jest obserwowane, bo na urządzeniach hybrydowych zmienia się
 *   w trakcie, gdy ktoś odłączy klawiaturę.
 *
 * WARTOŚĆ
 *   Ten sam kształt, co w `datetime-local`: `YYYY-MM-DDTHH:mm` czasu lokalnego albo pusto.
 *   Dzięki temu strona wyżej nie wie, który wariant się wyświetlił, i nie ma tu drugiego
 *   miejsca, w którym trzeba przeliczać strefy.
 */

const pad = (value: number) => String(value).padStart(2, '0');

const toValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** `YYYY-MM-DDTHH:mm` -> Date, albo null gdy pusto lub niepełne. */
function parseValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
  return Number.isNaN(date.getTime()) ? null : date;
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  );
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const onChange = (event: MediaQueryListEvent) => setCoarse(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return coarse;
}

export function DateTimeField({
  value,
  onChange,
  locale,
  className,
  labels
}: {
  value: string;
  onChange: (next: string) => void;
  locale: string;
  className?: string;
  labels: { open: string; clear: string; today: string; hour: string; minute: string };
}) {
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const selected = parseValue(value);
  const [month, setMonth] = useState<Date>(() => {
    const base = selected ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  /* Zamknięcie kliknięciem obok i Escape. `pointerdown`, nie `click`: przy `click` naciśnięcie
     na pole tekstowe gdzie indziej zdążyłoby przenieść ognisko zanim panel się zamknie. */
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month),
    [locale, month]
  );

  /* Nazwy dni z Intl, więc idą za językiem PANELU, a nie przeglądarki — to jest ta połowa
     usterki, której nie dało się naprawić przy widgecie systemowym.
     1 stycznia 2024 był poniedziałkiem; oba języki tego panelu zaczynają tydzień od
     poniedziałku, więc siedem kolejnych dni od tej daty daje właściwą kolejność. */
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i)));
  }, [locale]);

  const shown = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    // getDay(): niedziela = 0. Przesunięcie na tydzień zaczynający się poniedziałkiem.
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    return Array.from({ length: 42 }, (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);

  const display = selected
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(selected)
    : '';

  /* Pod palcem oddajemy pole systemowi. Ten sam `value` i ten sam `onChange`, więc dla strony
     wyżej to jest dokładnie to samo pole. */
  if (coarse) {
    return (
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      />
    );
  }

  const setDay = (day: Date) => {
    const base = selected ?? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0);
    onChange(toValue(new Date(
      day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes()
    )));
  };

  const setClock = (hours: number, minutes: number) => {
    const base = selected ?? new Date();
    onChange(toValue(new Date(
      base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes
    )));
  };

  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(className, 'flex items-center justify-between gap-2 text-left')}
      >
        <span className={display ? 'text-white' : 'text-white/35'}>{display || labels.open}</span>
        <CalendarDays size={15} className="shrink-0 text-white/45" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={labels.open}
          className="absolute left-0 z-30 mt-2 w-[19rem] rounded-2xl border border-white/15 bg-navy-950 p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="←"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold capitalize text-white">{monthLabel}</span>
            <button
              type="button"
              aria-label="→"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5">
            {weekdays.map((day) => (
              <span key={day} className="py-1 text-center text-[10px] uppercase text-white/35">
                {day}
              </span>
            ))}
            {shown.map((day) => {
              const outside = day.getMonth() !== month.getMonth();
              const picked = selected ? sameDay(day, selected) : false;
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setDay(day)}
                  className={cn(
                    'rounded-lg py-1.5 text-center text-xs tabular-nums transition-colors',
                    picked
                      ? 'bg-yellow font-extrabold text-navy-950'
                      : outside
                        ? 'text-white/20 hover:bg-white/5'
                        : 'text-white/80 hover:bg-white/10',
                    !picked && sameDay(day, today) ? 'ring-1 ring-inset ring-yellow/50' : ''
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
            <select
              aria-label={labels.hour}
              value={selected ? selected.getHours() : 12}
              onChange={(event) =>
                setClock(Number(event.target.value), selected ? selected.getMinutes() : 0)}
              className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h} className="bg-navy-950">{pad(h)}</option>
              ))}
            </select>
            <span className="text-white/40">:</span>
            <select
              aria-label={labels.minute}
              value={selected ? selected.getMinutes() - (selected.getMinutes() % 5) : 0}
              onChange={(event) =>
                setClock(selected ? selected.getHours() : 12, Number(event.target.value))}
              className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white"
            >
              {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                <option key={m} value={m} className="bg-navy-950">{pad(m)}</option>
              ))}
            </select>

            <div className="ml-auto flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  onChange(toValue(new Date(
                    now.getFullYear(), now.getMonth(), now.getDate(),
                    selected ? selected.getHours() : now.getHours(),
                    selected ? selected.getMinutes() : 0
                  )));
                }}
                className="rounded-lg px-2 py-1.5 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white"
              >
                {labels.today}
              </button>
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="rounded-lg px-2 py-1.5 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white"
              >
                {labels.clear}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
