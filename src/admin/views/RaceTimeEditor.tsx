import { useId, useRef, useState } from 'react';
import { formatRaceTime, parseRaceTime } from '../../lib/race-time';
import type { TranslateKey } from '../i18n';

export function RaceTimeEditor({ value, timingReady, disabled, t, onSave }: {
  value?: number | null;
  timingReady: boolean;
  disabled?: boolean;
  t: (key: TranslateKey) => string;
  onSave: (value: number | null) => Promise<boolean>;
}) {
  // null follows the server; a string (including blank) is an unsaved local draft.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const id = useId();
  const input = draft ?? formatRaceTime(value);
  let parsed: number | null = null;
  let invalid = false;
  try { parsed = parseRaceTime(input); } catch { invalid = true; }
  const dirty = draft !== null && input !== formatRaceTime(value);
  return <div className="grid min-w-0 gap-2 py-1 text-xs" data-race-time-editor>
    <label htmlFor={id} className="font-bold">{t('vote.raceTime')}</label>
    <div className="flex flex-wrap items-center gap-2">
      <input id={id} data-race-time value={input} placeholder="00:00.000" autoComplete="off"
        disabled={disabled || saving || !timingReady} aria-invalid={invalid} aria-describedby={`${id}-hint`}
        className="min-w-0 w-40 rounded-lg border border-current/20 bg-black/10 px-3 py-2.5 font-mono text-sm tabular-nums outline-none focus:border-yellow focus:ring-1 focus:ring-yellow disabled:opacity-50"
        onChange={(event) => { setDraft(event.target.value); setFailed(false); }} />
      <button type="button" data-race-time-save disabled={disabled || saving || !timingReady || !dirty || invalid}
        className="rounded-full bg-yellow px-4 py-2.5 font-semibold text-navy-950 hover:bg-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
        onClick={async () => {
          if (locked.current || disabled || !timingReady || invalid || !dirty) return;
          locked.current = true; setSaving(true); setFailed(false);
          try {
            if (await onSave(parsed)) setDraft(null);
            else setFailed(true);
          } catch { setFailed(true); }
          finally { locked.current = false; setSaving(false); }
        }}>{t(saving ? 'set.saving' : 'vote.save')}</button>
    </div>
    <span id={`${id}-hint`} className={invalid ? 'text-coral' : 'text-muted-foreground'} role={invalid ? 'alert' : undefined}>
      {t(!timingReady ? 'vote.timingUnavailable' : invalid ? 'vote.raceTimeInvalid' : 'vote.raceTimeHint')}
    </span>
    {failed && <span role="alert">{t('vote.raceTimeSaveFailed')}</span>}
  </div>;
}
