
export function Highlighter({ text, query }: { text: string; query?: string }) {
  if (!query || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow text-navy-950 rounded-[2px] px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}
