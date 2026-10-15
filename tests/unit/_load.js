/**
 * _load.js – Lädt die klassischen Browser-Scripts des Spiels in Node (für node:test).
 *
 * Die Spiel-Dateien sind keine Module, sondern definieren Globals (const CONFIG …).
 * loadScripts() führt sie per vm.runInThisContext im globalen Kontext aus – genau wie
 * der Browser – und gibt die gewünschten Globals zurück. node --test startet jede
 * Testdatei in einem eigenen Prozess, daher wird jede Datei pro Prozess nur EINMAL
 * geladen (ein zweites `const CONFIG` wäre ein Fehler). Zustand zwischen Tests über
 * GameState.startRun() bzw. localStorage.clear() zurücksetzen.
 *
 * Beispiel:
 *   const { loadScripts, CORE_LOGIC_FILES } = require('./_load.js');
 *   const { GameState, CONFIG } = loadScripts(CORE_LOGIC_FILES, ['GameState', 'CONFIG']);
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

/** Reine Logik-Dateien in Lade-Reihenfolge (ohne Phaser). */
const CORE_LOGIC_FILES = [
  'src/config.js',
  'src/campus.js',
  'src/core/rng.js',
  'src/core/events.js',
  'src/core/storage.js',
  'src/core/scoring.js',
  'src/core/gameState.js',
];

/** Einfacher localStorage-Ersatz (Map-basiert). */
function createFakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

const loaded = new Set();

/**
 * Lädt Dateien (relativ zum Projektordner) in Reihenfolge und liefert die genannten Globals.
 * @param {string[]} files
 * @param {string[]} names
 * @returns {object}
 */
function loadScripts(files, names = []) {
  if (!globalThis.localStorage) globalThis.localStorage = createFakeLocalStorage();
  for (const file of files) {
    if (loaded.has(file)) continue;
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInThisContext(code, { filename: path.join(ROOT, file) });
    loaded.add(file);
  }
  if (names.length === 0) return {};
  return vm.runInThisContext(`({ ${names.join(', ')} })`);
}

module.exports = { loadScripts, CORE_LOGIC_FILES, ROOT, createFakeLocalStorage };
