/**
 * Runs before the page's own scripts. Waits for the site to publish its config
 * object and then appends the four placeholder sponsors, which is exactly what
 * the admin panel's "Wstaw 4 przykładowe logo" button writes.
 */
Object.defineProperty(window, 'CARRULEDDHI_CONFIG', {
  configurable: true,
  set(value) {
    value.sponsors = [
      { name: 'Mare Gallura', image: '/assets/images/sponsors/demo-1.svg', url: '' },
      { name: 'Verdi', image: '/assets/images/sponsors/demo-2.svg', url: 'https://example.com' },
      { name: 'Teresa', image: '/assets/images/sponsors/demo-3.svg', url: '' },
      { name: 'Bianca Costruzioni', image: '/assets/images/sponsors/demo-4.svg', url: '' }
    ];
    Object.defineProperty(window, 'CARRULEDDHI_CONFIG', {
      value,
      writable: true,
      configurable: true,
      enumerable: true
    });
  },
  get() {
    return undefined;
  }
});
