/// <reference types="vite/client" />

/**
 * The one build-time variable the panel reads.
 *
 * Declared explicitly rather than relying on the loose index signature so a typo in the
 * name is a compile error instead of `undefined` at runtime — which, for a password
 * check, would mean the login screen quietly reporting "not configured" forever.
 *
 * VITE_ prefixed variables are compiled into the bundle and served to the browser. That
 * is fine for this one: it guards the layout, not the data. The passphrase that protects
 * participant records is ROSTER_KEY, which lives only in Vercel's environment and is
 * checked by the function on every request.
 */
interface ImportMetaEnv {
  readonly VITE_ADMIN_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
