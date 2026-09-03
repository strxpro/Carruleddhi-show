import { useId, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Przycisk działania, który w stanie wyłączonym MÓWI, dlaczego jest wyłączony.
 * ============================================================================
 * JAKI BŁĄD TO ZAPOBIEGA
 *   Zgłoszenie właściciela brzmiało „nie mogę klikać guzików". Tak wygląda wyłączony
 *   przycisk, którego jedynym sygnałem jest `disabled:opacity-45`: napis jest na miejscu,
 *   kolor prawie ten sam, a pod palcem nie ma żadnego kursora, który by się zmienił — więc
 *   przycisk wygląda na sprawny i nie reaguje. Osoba przed ekranem nie ma z czego wnioskować,
 *   czy to awaria panelu, zerwane łącze, czy warunek, który sama może spełnić.
 *
 *   Dlatego stan wyłączony ma tu DWIE widoczne cechy naraz: własne, pełne tło (a nie
 *   przezroczystość — przezroczystość na ciemnym tle jest nieczytelna, zwłaszcza na telefonie
 *   w słońcu na zboczu) i zdanie obok, mówiące co zrobić. `aria-describedby` wiąże je z
 *   przyciskiem, więc czytnik ekranu podaje powód razem z nazwą, a nie jako luźny tekst
 *   gdzieś dalej na stronie.
 *
 * `reason` PUSTY ZNACZY KLIKALNY
 *   Jedno pole zamiast pary `disabled` + `title`. Rozdzielone dawały się rozjechać: warunek
 *   dopisany do `disabled` bez dopisania zdania do `title` to znowu przycisk gasnący bez
 *   powodu — a to jest dokładnie ten błąd, który ten plik naprawia. Tu nie da się wyłączyć
 *   przycisku, nie podając powodu, bo powód JEST warunkiem wyłączenia.
 *
 * Wspólny dla kilku ekranów (czas głosowania, kreator edycji, dwanaście nagród), bo to jest
 * reguła panelu, a nie ozdoba jednego widoku. Kopia w każdym z nich rozjechałaby się przy
 * pierwszej poprawce wyglądu.
 */
export function ActionButton({
  label,
  reason,
  tone,
  icon,
  confirmLabel,
  confirmTone,
  busy,
  onPress
}: {
  label: string;
  /** Puste = klikalny. Niepuste = wyłączony, a to jest zdanie wypisane obok przycisku. */
  reason: string;
  /** Klasy koloru dla stanu czynnego. Stan wyłączony ma własne, wspólne dla wszystkich. */
  tone: string;
  icon?: ReactNode;
  confirmLabel?: string;
  confirmTone?: string;
  busy?: boolean;
  onPress: () => void;
}) {
  const off = reason !== '';
  const describedBy = useId();
  
  const [armed, setArmed] = useState(false);
  const timer = useRef<number>(0);

  const disarm = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    setArmed(false);
  }, []);

  useEffect(() => disarm, [disarm]);

  const click = () => {
    if (confirmLabel && !armed) {
      setArmed(true);
      timer.current = window.setTimeout(disarm, 5000);
      return;
    }
    disarm();
    onPress();
  };
  return (
    <span className="inline-flex max-w-[19rem] flex-col gap-1">
      <button
        type="button"
        disabled={off || busy}
        aria-describedby={off ? describedBy : undefined}
        onClick={click}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold transition-all active:scale-[0.97] active:opacity-80 disabled:opacity-50 disabled:pointer-events-none',
          off ? 'cursor-not-allowed border border-white/20 bg-white/[0.08] text-white/70 active:scale-100 active:opacity-100' : armed ? (confirmTone || 'bg-coral text-white border border-coral') : tone
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
        {armed && confirmLabel ? confirmLabel : label}
      </button>
      {off ? (
        <span id={describedBy} className="text-[11px] leading-relaxed text-white/45">
          {reason}
        </span>
      ) : null}
    </span>
  );
}
