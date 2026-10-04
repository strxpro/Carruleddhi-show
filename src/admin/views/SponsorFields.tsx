import { ImagePlus } from 'lucide-react';
import type { TranslateKey } from '../i18n';

export function SponsorFields({ t, name, url, logo, onName, onUrl, onLogo, autoFocus = false }: {
  t: (key: TranslateKey) => string;
  name: string; url: string; logo: string;
  onName: (value: string) => void; onUrl: (value: string) => void; onLogo: () => void;
  autoFocus?: boolean;
}) {
  const input = 'w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-yellow focus:outline-none';
  return <div className="flex min-w-0 flex-1 items-start gap-3" data-sponsor-fields>
    <button type="button" onClick={onLogo} title={t('set.sponsorLogo')} aria-label={t('set.sponsorLogo')}
      className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-white/20 bg-white/5 text-white/40 hover:border-yellow hover:text-yellow">
      {logo ? <img src={logo} alt={name || t('set.sponsorLogo')} className="size-full object-contain" /> : <ImagePlus className="size-5" />}
    </button>
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <input autoFocus={autoFocus} maxLength={80} value={name} onChange={e => onName(e.target.value)} placeholder={t('set.sponsorName')} aria-label={t('set.sponsorName')} className={input} />
      <input maxLength={2048} value={url} onChange={e => onUrl(e.target.value)}
        onBlur={e => { const value = e.target.value.trim(); if (value && !/^[a-z][a-z\d+.-]*:/i.test(value)) onUrl('https://' + value); }}
        placeholder="https://…" aria-label={t('set.sponsorUrl')} inputMode="url" className={input} />
    </div>
  </div>;
}
