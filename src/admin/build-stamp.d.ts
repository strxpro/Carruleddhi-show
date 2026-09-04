/**
 * Znacznik wersji wstrzykiwany przez Vite przy budowaniu (patrz `define` w vite.config.mjs).
 *
 * Plik bez importow i eksportow, czyli skrypt globalny — dzieki temu deklaracja jest widoczna
 * w kazdym module panelu. Ta sama deklaracja w api.ts obowiazywalaby tylko tam, bo tamten plik
 * jest modulem.
 */
declare const __BUILD_STAMP__: string;
