import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Two applications in one build.
 *
 *   index.html and the legal pages — plain HTML, CSS and JavaScript. Untouched by any
 *   of this: React and Tailwind are not loaded there and the output is byte-for-byte
 *   what it was, because Rollup only pulls in what an entry actually imports.
 *
 *   admin.html — React and TypeScript, styled with Tailwind.
 *
 * The split is deliberate. The public site is the thing visitors wait for and it does
 * not need a framework to show a countdown. The admin panel is a dense, stateful tool
 * used by two people on a good connection, and that is exactly what React is for.
 *
 * Versions are pinned because getting here took three attempts: @vitejs/plugin-react
 * below 6 and @tailwindcss/vite below 4.3 both refuse Vite 8, and npm reports that as
 * an unresolved peer rather than "too old".
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      // The "@/..." convention the shadcn ecosystem assumes, so pasted components
      // resolve without rewriting every import by hand.
      '@': resolve(import.meta.dirname, 'admin-src')
    }
  },

  server: {
    // Listen on the LAN so a phone on the same Wi-Fi can open the Network URL.
    host: true,

    /**
     * Without this a Cloudflare quick tunnel reaches the dev server and gets back
     * "Blocked request. This host is not allowed." — Vite answers 403 to any Host
     * header it does not recognise, which is a real defence against DNS rebinding and
     * also rejects every tunnel domain, since those are random per session.
     *
     * Leading-dot wildcards, so only subdomains of these three tunnelling services are
     * let through, not "any host". Development only; `vite build` ignores this block.
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
      },
    },
  },
});
