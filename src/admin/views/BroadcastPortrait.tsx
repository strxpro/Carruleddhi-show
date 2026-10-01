import { useEffect, useRef, useState } from 'react';
import type { TranslateKey } from '../i18n';
import type { Participant } from '../../obs/types';
import '../../obs/portrait-mask.css';

export function BroadcastPortrait({ participant, t, busy, onSave, onClose }: {
  participant: Participant;
  t: (key: TranslateKey) => string;
  busy: boolean;
  onSave: (image: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const generation = useRef(0);

  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { panel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, []);
  useEffect(() => () => { image?.close(); }, [image]);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !image) return;
    const edge = Math.min(image.width, image.height) / zoom;
    context.clearRect(0, 0, 640, 640);
    context.drawImage(image, (image.width - edge) * x / 100, (image.height - edge) * y / 100,
      edge, edge, 0, 0, 640, 640);
  }, [image, zoom, x, y]);

  async function pick(file?: File) {
    if (!file || busy) return;
    const request = ++generation.current;
    setError(false);
    setImage(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError(true);
      return;
    }
    setDecoding(true);
    try {
      const bitmap = await createImageBitmap(file);
      if (request !== generation.current) { bitmap.close(); return; }
      setZoom(1); setX(50); setY(50);
      setImage(bitmap);
    } catch {
      if (request === generation.current) setError(true);
    } finally {
      if (request === generation.current) setDecoding(false);
    }
  }

  return (
    <section ref={panel} className="live-panel live-portrait" aria-labelledby="live-portrait-title">
      <h3 id="live-portrait-title">{t('live.photo')}: #{participant.startNumber} {participant.firstName} {participant.lastName}</h3>
      <p className="live-help">{t('live.photoHint')}</p>
      <fieldset disabled={busy || decoding}>
        <div className="live-actions">
          <button type="button" className="live-button live-button-primary" onClick={() => camera.current?.click()}>{t('live.takePhoto')}</button>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => {
            void pick(event.target.files?.[0]); event.target.value = '';
          }} />
        </div>
        <label className="live-field">
          <span>{t('live.photoFile')}</span>
          <input autoFocus type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
            void pick(event.target.files?.[0]); event.target.value = '';
          }} />
        </label>
        {image && <div className="live-crop-grid">
          <div className="live-mask-preview"><canvas ref={canvas} width={640} height={640} className="live-crop broadcast-photo-mask" role="img" aria-label={t('live.crop')} /><p className="live-help">{t('live.maskPreview')}</p></div>
          <div className="live-fields">
            <label className="live-field"><span>{t('live.zoom')} ({zoom.toFixed(1)}x)</span>
              <input type="range" min="1" max="4" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            <label className="live-field"><span>{t('live.horizontal')} ({x}%)</span>
              <input type="range" min="0" max="100" value={x} onChange={(e) => setX(Number(e.target.value))} />
            </label>
            <label className="live-field"><span>{t('live.vertical')} ({y}%)</span>
              <input type="range" min="0" max="100" value={y} onChange={(e) => setY(Number(e.target.value))} />
            </label>
          </div>
        </div>}
        <div className="live-actions">
          <button type="button" className="live-button live-button-primary" disabled={!image} onClick={async () => {
            if (!canvas.current || !image) return;
            // WebP preserves a prepared transparent cutout; no live image generation.
            if (await onSave(canvas.current.toDataURL('image/webp', 0.9))) onClose();
          }}>{t('live.photoSave')}</button>
          <button type="button" className="live-button" onClick={onClose}>{t('live.cancel')}</button>
        </div>
      </fieldset>
      {decoding && <p role="status" className="live-help">{t('common.loading')}</p>}
      {error && <p role="alert" className="live-error">{t('vote.photoTooBig')}</p>}
    </section>
  );
}
