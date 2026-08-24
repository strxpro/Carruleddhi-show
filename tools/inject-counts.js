/**
 * Runs before the page scripts. Answers only the counts call with a canned payload
 * so the avatar row and the two totals can be verified without a live Worker or
 * database. Everything else goes to the network untouched.
 */
(() => {
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes('/api/carruleddhi/counts')) {
      return new Response(
        JSON.stringify({
          ok: true,
          attendees: 1234,
          pilots: 57,
          initials: ['MR', 'GP', 'HP', 'AB', 'ZK']
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return real(input, init);
  };
})();
