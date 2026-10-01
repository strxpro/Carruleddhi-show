import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';

// The legacy application predates ESLint. Scope this new check to the broadcast package.
export default defineConfig([
  {
    files: ['src/obs/**/*.{ts,tsx}', 'src/admin/views/LiveControl.tsx', 'src/admin/views/BroadcastPortrait.tsx', 'src/admin/views/RosterLive.tsx', 'src/admin/views/RaceTimeEditor.tsx'],
    extends: [js.configs.recommended, ts.configs.recommended],
    languageOptions: { globals: globals.browser },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  {
    files: ['worker/broadcast*.js', 'tools/test-obs-*.mjs', 'tools/test-sponsor-queue.mjs', 'tools/test-roster-live.mjs', 'tools/test-admin-broadcast-setup.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
]);
