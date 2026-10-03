import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';

// The legacy application predates ESLint. Scope this new check to the broadcast package.
export default defineConfig([
  {
    files: ['src/obs/**/*.{ts,tsx}', 'src/admin/views/LiveControl.tsx', 'src/admin/views/BroadcastPortrait.tsx', 'src/admin/views/RosterLive.tsx', 'src/admin/views/RaceTimeEditor.tsx', 'src/admin/views/RunControl.tsx', 'src/admin/views/BroadcastScenesLinks.tsx'],
    extends: [js.configs.recommended, ts.configs.recommended],
    languageOptions: { globals: globals.browser },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  {
    files: ['worker/broadcast*.js', 'worker/roster-confirm.test.js', 'tools/test-obs-*.mjs', 'tools/test-sponsor-queue.mjs', 'tools/test-roster-live.mjs', 'tools/test-roster-bulk.mjs', 'tools/test-admin-broadcast-setup.mjs', 'tools/test-broadcast-*.mjs', 'tools/test-sponsor-layout.mjs', 'tools/test-scene-*.mjs', 'tools/test-stream-effects.mjs', 'tools/test-show-sequence.mjs', 'tools/test-race-results*.mjs', 'tools/test-public-race-times.mjs', 'tools/race-timer*.mjs', 'tools/test-race-timer.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
]);
