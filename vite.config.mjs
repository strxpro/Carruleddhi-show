import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Listen on the LAN so a phone on the same Wi-Fi can open the Network URL.
    host: true,

    /**
     * Without this a Cloudflare quick tunnel reaches the dev server and gets back
     * "Blocked request. This host is not allowed." — Vite answers 403 to any Host
     * header it does not recognise, which is a real defence against DNS rebinding
     * and also rejects every tunnel domain, since those are random per session.
     *
     * The entries are leading-dot wildcards, so only subdomains of these three
     * tunnelling services are let through, not "any host". Development only —
     * `vite build` does not read this block.
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
