/** Slad wywolan w chwili ostrzezenia o petli — po nim widac, ktory komponent ja krzeci. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stacks = [];
  const real = console.error.bind(console);
  console.error = (...args) => {
    const text = args.map((a) => (typeof a === 'string' ? a : (a && a.message) || '')).join(' ');
    if (/Maximum update depth/i.test(text) && stacks.length < 3) {
      stacks.push(String(new Error().stack || '').split('\n').slice(1, 14).join('\n'));
    }
    real(...args);
  };
  await sleep(3500);
  return { ilesladow: stacks.length, slad: stacks[0] || '(brak)' };
}
