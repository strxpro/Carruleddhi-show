/**
 * Placeholder shapes for the moment before data arrives.
 *
 * WHY THIS REPLACES "Wczytuję…"
 *   A line of text saying "loading" tells you the panel is alive and nothing about what is
 *   coming. Worse, when it is replaced the layout jumps from one line to a full table, so every
 *   load ends with the page rearranging itself under the cursor.
 *
 *   Shapes the size of the rows that are about to appear say "a table of about this shape is
 *   coming", and when the data lands nothing moves — the skeleton is already occupying the
 *   space. That is the whole point of it; the shimmer is decoration.
 *
 * WHY THE ANIMATION IS ONE GRADIENT AND NOT ONE PER ROW
 *   Twenty separately animating boxes are twenty composited layers on a screen where nothing
 *   has happened yet. The sweep is a single background animation on each bar, no transforms and
 *   no filters, so it costs a repaint of a few small rectangles.
 */

/** One grey bar. `w` is any Tailwind width class so callers can shape a row. */
export function SkeletonBar({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <span className={`block ${w} ${h} animate-skeleton rounded bg-muted`} />;
}

/**
 * A table's worth of rows.
 *
 * `cols` is a list of width classes, one per column, so the skeleton has the proportions of the
 * real table rather than being evenly striped. A skeleton that does not match what replaces it
 * still causes the jump it was added to prevent.
 */
export function SkeletonTable({ rows = 5, cols = ['w-1/3', 'w-1/4', 'w-1/5', 'w-16'] }: {
  rows?: number;
  cols?: string[];
}) {
  return (
    <div
      className="mt-5 overflow-hidden rounded-2xl border border-border"
      // Announced as busy rather than as a table of empty cells, so a screen reader says
      // "loading" instead of reading out eight blank columns.
      role="status"
      aria-busy="true"
      aria-label="…"
    >
      <div className="flex gap-4 border-b border-border bg-muted/40 px-4 py-3">
        {cols.map((col, index) => (
          <SkeletonBar key={index} w={col} h="h-3" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 border-b border-border/60 px-4 py-4 last:border-b-0">
          {cols.map((col, index) => (
            <SkeletonBar key={index} w={col} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Cards rather than rows — for the comments screen, which is a list of boxes. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="mt-5 grid gap-3" role="status" aria-busy="true" aria-label="…">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="grid gap-2.5 rounded-2xl border border-border p-4">
          <SkeletonBar w="w-1/4" h="h-3" />
          <SkeletonBar w="w-full" />
          <SkeletonBar w="w-4/5" />
          <SkeletonBar w="w-1/3" h="h-3" />
        </div>
      ))}
    </div>
  );
}
