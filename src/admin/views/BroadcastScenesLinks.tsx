import { useRef, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import type { TranslateKey } from '../i18n';
import { CAMERA, EFFECTS, SCENES, VOTE_URL } from '../../obs/scenes/presets';

const messages = {
  pl: {
    title: 'Sceny i efekty OBS',
    local: 'To tylko generator linków. Opcje zmieniają wyłącznie adresy poniżej, nie zapisują drugiego stanu transmisji ani nie sterują LIVE.',
    scenes: 'Sceny', effects: 'Efekty', language: 'Język sceny', italian: 'Włoski', polish: 'Polski',
    background: 'Tło sceny', transparent: 'Przezroczyste', solid: 'Pełne',
    camera: 'Ramka kamery', qr: 'Kod QR', sponsors: 'Sponsorzy w scenie', once: 'Efekty jednorazowe',
    setup: 'Dodaj źródło przeglądarkowe OBS: 1920 x 1080. Źródło kamery umieść pod nakładką sceny. Transformacja kamery:',
    qrHint: 'Kod QR zawsze prowadzi do prawdziwego, publicznego głosowania:',
    sponsorsHint: 'Wyłącz sponsorów w scenie, jeśli używasz osobnego, globalnego źródła SPONSORZY, aby nie dublować paska.',
    effectsHint: 'Efekty mają zawsze przezroczyste tło. Domyślnie powtarzają się z przerwami. Dla efektu jednorazowego włącz w OBS „Wyłącz źródło, gdy niewidoczne”, aby uruchomić go ponownie przy pokazaniu, lub odśwież źródło. Dla SPONSORZY pozostaw tę opcję wyłączoną, aby zachować ciągłość paska.',
    previewHint: 'Podgląd scen dodaje guides=1 (prowadnice); kopiowany adres ich nie zawiera.',
    copy: 'Kopiuj', preview: 'Podgląd', copied: 'Skopiowano adres.',
    copyFailed: 'Schowek niedostępny. Adres zaznaczono; skopiuj go ręcznie.',
  },
  it: {
    title: 'Scene ed effetti OBS',
    local: 'Questo è solo un generatore di link. Le opzioni modificano esclusivamente gli indirizzi qui sotto: non salvano un secondo stato della diretta e non controllano LIVE.',
    scenes: 'Scene', effects: 'Effetti', language: 'Lingua della scena', italian: 'Italiano', polish: 'Polacco',
    background: 'Sfondo della scena', transparent: 'Trasparente', solid: 'Pieno',
    camera: 'Cornice della videocamera', qr: 'Codice QR', sponsors: 'Sponsor nella scena', once: 'Effetti singoli',
    setup: 'Aggiungi una sorgente browser OBS: 1920 x 1080. Posiziona la sorgente della videocamera sotto la grafica della scena. Trasformazione della videocamera:',
    qrHint: 'Il codice QR apre sempre la vera pagina pubblica di votazione:',
    sponsorsHint: 'Disattiva gli sponsor nella scena se usi la sorgente globale separata SPONSORZY, per non duplicare la fascia.',
    effectsHint: 'Gli effetti hanno sempre lo sfondo trasparente. Per impostazione predefinita si ripetono con pause. Per riavviare un effetto singolo quando torna visibile, attiva in OBS “Chiudi la sorgente quando non è visibile”, oppure aggiorna la sorgente. Per SPONSORZY lascia questa opzione disattivata per mantenere la continuità della fascia.',
    previewHint: 'L’anteprima delle scene aggiunge guides=1 (guide); il link copiato non le contiene.',
    copy: 'Copia', preview: 'Anteprima', copied: 'Indirizzo copiato.',
    copyFailed: 'Appunti non disponibili. Indirizzo selezionato: copialo manualmente.',
  },
};

function SourceLink({ id, label, url, preview, text }: {
  id: string; label: string; url: string; preview: string; text: typeof messages.it;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<'copied' | 'copyFailed' | null>(null);
  return <li className="scene-catalog-source" data-obs-catalog-source={id}>
    <label className="live-field"><span>{label} / 1920 x 1080</span>
      <input ref={input} type="text" readOnly value={url} onFocus={(event) => event.target.select()} />
    </label>
    <div className="live-actions">
      <button type="button" className="live-button" aria-label={`${text.copy}: ${label}`} onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setNotice('copied');
        } catch {
          input.current?.focus();
          input.current?.select();
          setNotice('copyFailed');
        }
      }}><Copy size={16} aria-hidden="true" />{text.copy}</button>
      <a className="live-button" href={preview} target="_blank" rel="noopener noreferrer" aria-label={`${text.preview}: ${label}`}>
        <ExternalLink size={16} aria-hidden="true" />{text.preview}
      </a>
    </div>
    {notice && <p className="live-help" role="status">{text[notice]}</p>}
  </li>;
}

export function BroadcastScenesLinks({ t }: { t: (key: TranslateKey) => string }) {
  const pl = t('locale.intl').startsWith('pl');
  const text = messages[pl ? 'pl' : 'it'];
  const [language, setLanguage] = useState('it');
  const [background, setBackground] = useState('transparent');
  const [camera, setCamera] = useState(true);
  const [qr, setQr] = useState(true);
  const [sponsors, setSponsors] = useState(true);
  const [once, setOnce] = useState(false);
  const params = new URLSearchParams();
  if (language === 'pl') params.set('lang', 'pl');
  if (background === 'solid') params.set('background', 'solid');
  if (!camera) params.set('camera', '0');
  if (!qr) params.set('qr', '0');
  if (!sponsors) params.set('sponsors', '0');
  const query = params.size ? `?${params}` : '';

  return <details className="live-panel scene-catalog" data-obs-scene-catalog>
    <summary>{text.title}</summary>
    <p className="live-help">{text.local}</p>
    <p className="live-help">{text.setup} <strong>x {CAMERA.x}, y {CAMERA.y}, {CAMERA.width} x {CAMERA.height}</strong>.</p>
    <p className="live-help">{text.qrHint} <a href={VOTE_URL} target="_blank" rel="noopener noreferrer">{VOTE_URL}</a></p>
    <fieldset className="scene-catalog-options">
      <legend>{text.scenes}</legend>
      <div className="live-form-grid">
        <label className="live-field"><span>{text.language}</span>
          <select name="scene-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="it">{text.italian}</option><option value="pl">{text.polish}</option>
          </select>
        </label>
        <label className="live-field"><span>{text.background}</span>
          <select name="scene-background" value={background} onChange={(event) => setBackground(event.target.value)}>
            <option value="transparent">{text.transparent}</option><option value="solid">{text.solid}</option>
          </select>
        </label>
        <label className="live-checkbox"><input name="scene-camera" type="checkbox" checked={camera} onChange={(event) => setCamera(event.target.checked)} /><span>{text.camera}</span></label>
        <label className="live-checkbox"><input name="scene-qr" type="checkbox" checked={qr} onChange={(event) => setQr(event.target.checked)} /><span>{text.qr}</span></label>
        <label className="live-checkbox"><input name="scene-sponsors" type="checkbox" checked={sponsors} onChange={(event) => setSponsors(event.target.checked)} /><span>{text.sponsors}</span></label>
      </div>
      <p className="live-help">{text.sponsorsHint}</p>
    </fieldset>
    <p className="live-help">{text.previewHint}</p>
    <ul className="live-list">
      {Object.entries(SCENES).map(([id, scene]) => {
        const url = `${window.location.origin}/obs/${id}${query}`;
        return <SourceLink key={id} id={id} label={pl ? scene.labelPl : scene.label} url={url}
          preview={`${url}${query ? '&' : '?'}guides=1`} text={text} />;
      })}
    </ul>
    <fieldset className="scene-catalog-options">
      <legend>{text.effects}</legend>
      <label className="live-checkbox"><input name="effect-once" type="checkbox" checked={once} onChange={(event) => setOnce(event.target.checked)} /><span>{text.once}</span></label>
      <p className="live-help">{text.effectsHint}</p>
    </fieldset>
    <ul className="live-list">
      {EFFECTS.map((effect) => {
        const url = `${window.location.origin}/obs/effects/${effect.id}${once ? '?once=1' : ''}`;
        return <SourceLink key={effect.id} id={effect.id} label={pl ? effect.labelPl : effect.label} url={url} preview={url} text={text} />;
      })}
    </ul>
  </details>;
}
