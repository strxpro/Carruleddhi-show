import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Two worlds in one build, on purpose.
 *
 * The public site is hand-written HTML, CSS and JavaScript and stays that way: it is
 * finished, it is fast, and rewriting it in React would buy nothing a visitor could
 * notice. The admin panel is a different problem — tabs, live chat, a filterable
 * roster, two languages — and that is what React is for.
 *
 * Vite treats them as separate entry points, so the marketing pages never load React
 * and the panel never loads GSAP. The only thing they share is the API.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],

  /* ZNACZNIK WERSJI, WSTRZYKIWANY PRZY BUDOWANIU.
     ---------------------------------------------------------------------------
     Powod jest praktyczny i kosztowal caly wieczor: przy kazdej poprawce panelu
     wracalo pytanie „czy on w ogole widzi nowa wersje", i nie bylo jak na nie
     odpowiedziec — ani jemu, ani mnie. Zrzut ekranu wyglada tak samo niezaleznie od
     tego, ktora paczke trzyma przegladarka.

     Teraz panel wypisuje date budowania. Jedno spojrzenie rozstrzyga, czy problem jest
     w kodzie, czy w pamieci podrecznej. */
  define: { __BUILD_STAMP__: JSON.stringify(new Date().toISOString()) },

  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') }
  },

  server: {
    // Listen on the LAN so a phone on the same Wi-Fi can open the Network URL.
    host: true,

    /**
     * Without this a Cloudflare quick tunnel reaches the dev server and gets back
     * "Blocked request. This host is not allowed." — Vite answers 403 to any Host
     * header it does not recognise, which is a real defence against DNS rebinding
     * and also rejects every tunnel domain, since those are random per session.
     *
     * Leading-dot wildcards, so only subdomains of these three tunnelling services
     * are let through, not "any host". Development only — `vite build` ignores this.
     */
    allowedHosts: ['.trycloudflare.com', '.loca.lt', '.ngrok-free.app']
  },

  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
        privacy: resolve(import.meta.dirname, 'privacy.html'),
        cookies: resolve(import.meta.dirname, 'cookies.html'),
        regolamento: resolve(import.meta.dirname, 'regolamento.html'),
        // Podstrona głosowania. Bez tego wpisu Vite jej nie zbuduje, a odsyłacz „Zagłosuj"
        // prowadziłby na produkcji w 404 — i tylko na produkcji, bo `npm run dev` podaje
        // pliki z katalogu roboczego.
        votazione: resolve(import.meta.dirname, 'votazione.html')
      }
    }
  }
});
