import { createPortal } from 'react-dom';
import type { PanelLocale } from '../i18n';
import type { RosterRow } from '../api';

/**
 * Start cards for every rider, laid out for paper.
 *
 * WHY THIS EXISTS RATHER THAN `window.print()` ON THE TABLE
 *   The button used to call `window.print()` on whatever was on screen. That prints the
 *   admin panel: a dark sidebar, a search box, the current scroll position of a table, and
 *   whichever rows happened to be rendered. What the start line needs is one card per rider
 *   with the number large enough to read from a metre away, and every rider present whether
 *   or not they were visible when the button was pressed.
 *
 *   So this is a separate block of markup that only exists on paper. It is in the DOM the
 *   whole time and hidden on screen — `@media print` in admin.css shows it and hides the
 *   panel around it. Building it into a new window instead would need a popup (blocked as
 *   often as not) and a second copy of the styles.
 *
 * WHAT IS ON A CARD, AND WHY
 *   The number, because that is what a marshal is matching against a cart. The name, because
 *   that is what they are matching against a person. Category and cart name, because two
 *   riders in one family share a surname. The guardian's name and phone on a minor's card,
 *   because that is the one thing somebody at the start line may urgently need and cannot look
 *   up on a phone with no signal.
 *
 *   Not the e-mail and not the address. A stack of paper carrying forty addresses is a stack of
 *   paper that gets left on a table.
 */
export function StartCards({ rows, locale }: { rows: RosterRow[]; locale: PanelLocale }) {
  const pl = locale === 'pl';

  /* Withdrawn entries are left out. Their number is back in the pool and may already be
     printed on somebody else's card, so two cards with one number is exactly the confusion
     this is meant to prevent. */
  const riders = rows.filter((row) => row.status !== 'withdrawn');

  /* Rendered straight into <body> rather than where it sits in the tree.
     The print stylesheet hides everything except this block, and the only way to write that
     rule without listing every wrapper between here and the root is for this to be a direct
     child of body. A portal costs nothing and makes the CSS one selector instead of a chain
     that breaks the next time a layout div is added. */
  return createPortal(
    <div className="start-cards" aria-hidden="true">
      <header className="start-cards__head">
        <strong>Carruleddhi Show 2026</strong>
        <span>
          {pl ? 'Karty startowe' : 'Cartellini di partenza'} · {riders.length}{' '}
          {pl ? 'uczestników' : 'partecipanti'}
        </span>
        <span>
          {new Date().toLocaleDateString(pl ? 'pl-PL' : 'it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })}
        </span>
      </header>

      {riders.map((row) => (
        <article className="start-card" key={row.id}>
          <div className="start-card__number">{row.raceNumber || '—'}</div>
          <div className="start-card__body">
            <strong className="start-card__name">
              {`${row.firstName} ${row.lastName}`.trim() || '—'}
            </strong>
            <span className="start-card__cart">
              {row.cartName || (pl ? '(bez nazwy)' : '(senza nome)')}
              {row.teamName ? ` · ${row.teamName}` : ''}
            </span>
            <span className="start-card__meta">
              {(row.category || '').toUpperCase()}
              {row.riderAge ? ` · ${row.riderAge} ${pl ? 'lat' : 'anni'}` : ''}
              {row.phone ? ` · ${row.phone}` : ''}
            </span>

            {/* The block a marshal may need in a hurry and cannot look up. */}
            {row.isMinor ? (
              <span className="start-card__minor">
                {pl ? 'NIELETNI' : 'MINORENNE'}
                {row.guardian?.name ? ` — ${row.guardian.name}` : ''}
                {row.guardian?.phone ? ` · ${row.guardian.phone}` : ''}
              </span>
            ) : null}
          </div>

          {/* Somewhere to tick. The technical check happens at the start line with a pen, and
              a card with no space for that gets a mark scrawled across the name. */}
          <div className="start-card__checks">
            <span>□ {pl ? 'kask' : 'casco'}</span>
            <span>□ {pl ? 'wózek' : 'mezzo'}</span>
            <span>□ {pl ? 'formularz' : 'modulo'}</span>
          </div>
        </article>
      ))}

      {riders.length === 0 ? (
        <p className="start-cards__empty">
          {pl ? 'Brak zgłoszeń do wydrukowania.' : 'Nessuna iscrizione da stampare.'}
        </p>
      ) : null}
    </div>,
    document.body
  );
}
