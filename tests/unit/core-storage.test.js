/**
 * core-storage.test.js – Unit-Tests für Storage (src/core/storage.js).
 *
 * Prüft: JSON-Rundreise mit Präfix, Fallback-Werte, kaputtes JSON, In-Memory-Fallback ohne
 * localStorage / mit werfendem localStorage / bei vollem Speicher, Highscore nur bei
 * Verbesserung, Erfolge, unlockChapter = max, Settings-Merge, resetAll.
 * Aufruf: node --test "tests/unit/core-storage.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, CORE_LOGIC_FILES } = require('./_load.js');

const { Storage, CONFIG } = loadScripts(CORE_LOGIC_FILES, ['Storage', 'CONFIG']);
const PREFIX = CONFIG.STORAGE_PREFIX;
const CHAPTER_COUNT = CONFIG.CHAPTERS.length;

/**
 * Ersetzt globalThis.localStorage für die Dauer von fn durch einen anderen Property-Deskriptor
 * (Wert oder Getter) und stellt danach den ursprünglichen Zustand wieder her.
 */
function withLocalStorageDescriptor(descriptor, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...descriptor });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}

/** localStorage, bei dem jede Methode wirft (z. B. Safari privat, blockierte Cookies). */
function createThrowingStorage() {
  const fail = () => {
    throw new Error('SecurityError: The operation is insecure.');
  };
  return { getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail, length: 0 };
}

test.beforeEach(() => {
  Storage.resetAll();
  globalThis.localStorage.clear();
});

test('set/get: JSON-Rundreise mit Präfix im localStorage', () => {
  const value = { name: 'Alex Muster', list: [1, 2, 3], nested: { ok: true }, nothing: null };
  assert.equal(Storage.set('demo', value), true);
  assert.deepEqual(Storage.get('demo'), value);
  assert.equal(globalThis.localStorage.getItem(PREFIX + 'demo'), JSON.stringify(value));
  assert.equal(globalThis.localStorage.getItem('demo'), null, 'nie ohne Präfix speichern');
  Storage.set('zahl', 7);
  Storage.set('text', 'Brezel');
  Storage.set('wahr', false);
  assert.equal(Storage.get('zahl'), 7);
  assert.equal(Storage.get('text'), 'Brezel');
  assert.equal(Storage.get('wahr', true), false);
});

test('get liefert den Fallback bei fehlendem Schlüssel (Standard null)', () => {
  assert.equal(Storage.get('fehlt'), null);
  assert.equal(Storage.get('fehlt', 5), 5);
  assert.deepEqual(Storage.get('fehlt', { a: 1 }), { a: 1 });
});

test('get liefert den Fallback bei kaputtem JSON', () => {
  globalThis.localStorage.setItem(PREFIX + 'kaputt', '{nicht: json');
  assert.equal(Storage.get('kaputt', 'fallback'), 'fallback');
});

test('get liefert eine Kopie – Änderungen am Ergebnis landen nicht im Speicher', () => {
  Storage.set('liste', [1, 2]);
  const list = Storage.get('liste');
  list.push(3);
  assert.deepEqual(Storage.get('liste'), [1, 2]);
});

test('set mit nicht serialisierbarem Wert liefert false und wirft nicht', () => {
  const circular = {};
  circular.self = circular;
  assert.equal(Storage.set('kreis', circular), false);
  assert.equal(Storage.get('kreis', 'leer'), 'leer');
});

test('remove löscht einen Schlüssel', () => {
  Storage.set('weg', 1);
  Storage.remove('weg');
  assert.equal(Storage.get('weg', 'leer'), 'leer');
  assert.equal(globalThis.localStorage.getItem(PREFIX + 'weg'), null);
});

test('Fallback ohne localStorage: In-Memory, wirft nie', () => {
  withLocalStorageDescriptor({ value: undefined, writable: true }, () => {
    assert.equal(Storage.isAvailable(), false);
    assert.doesNotThrow(() => Storage.set('mem', { a: 1 }));
    assert.equal(Storage.set('mem', { a: 2 }), false, 'false = nicht dauerhaft gespeichert');
    assert.deepEqual(Storage.get('mem'), { a: 2 });
    assert.equal(Storage.submitHighscore({ score: 1234, rank: 'Analogmensch', clockLabel: '09:00', won: true }), true);
    assert.equal(Storage.getHighscore().score, 1234);
    assert.equal(Storage.addAchievement('TOS_READER'), true);
    assert.deepEqual(Storage.getAchievements(), ['TOS_READER']);
    Storage.unlockChapter(3);
    assert.equal(Storage.getUnlockedChapter(), 3);
    Storage.setSettings({ muted: true });
    assert.equal(Storage.getSettings().muted, true);
    Storage.remove('mem');
    assert.equal(Storage.get('mem', 'leer'), 'leer');
    Storage.resetAll();
    assert.equal(Storage.getHighscore(), null);
  });
});

test('Fallback mit kaputtem localStorage (jede Methode wirft): In-Memory, wirft nie', () => {
  withLocalStorageDescriptor({ value: createThrowingStorage(), writable: true }, () => {
    assert.equal(Storage.isAvailable(), false);
    assert.equal(Storage.set('mem', [1, 2, 3]), false);
    assert.deepEqual(Storage.get('mem'), [1, 2, 3]);
    assert.equal(Storage.get('unbekannt', 'fb'), 'fb');
    assert.equal(Storage.addAchievement('PHISHED'), true);
    assert.equal(Storage.addAchievement('PHISHED'), false);
    assert.doesNotThrow(() => Storage.remove('mem'));
    assert.doesNotThrow(() => Storage.resetAll());
    assert.deepEqual(Storage.getAchievements(), []);
  });
});

test('Fallback, wenn schon der Zugriff auf localStorage wirft (blockierte Website-Daten)', () => {
  withLocalStorageDescriptor(
    {
      get() {
        throw new Error('SecurityError: Access is denied for this document.');
      },
    },
    () => {
      assert.equal(Storage.set('mem', 'ok'), false);
      assert.equal(Storage.get('mem'), 'ok');
      assert.deepEqual(Storage.getSettings(), { muted: false });
      assert.doesNotThrow(() => Storage.resetAll());
    }
  );
});

test('voller Speicher (setItem wirft, getItem geht): neuester Wert bleibt in dieser Sitzung lesbar', () => {
  Storage.set('stand', 'alt');
  const real = globalThis.localStorage;
  const full = {
    getItem: (key) => real.getItem(key),
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: (key) => real.removeItem(key),
    clear: () => real.clear(),
    key: (index) => real.key(index),
    get length() {
      return real.length;
    },
  };
  withLocalStorageDescriptor({ value: full, writable: true }, () => {
    assert.equal(Storage.set('stand', 'neu'), false);
    assert.equal(Storage.get('stand'), 'neu');
  });
});

test('getHighscore ist ohne Eintrag null', () => {
  assert.equal(Storage.getHighscore(), null);
});

test('submitHighscore speichert nur bei Verbesserung', () => {
  const first = { score: 5000, rank: 'Fortgeschrittene:r Ersti', clockLabel: '08:55', won: true, date: '2026-10-15T08:55:00.000Z' };
  assert.equal(Storage.submitHighscore(first), true, 'erster Eintrag ist immer ein Highscore');
  assert.deepEqual(Storage.getHighscore(), first);
  assert.equal(Storage.submitHighscore({ ...first, score: 4000 }), false, 'schlechter');
  assert.equal(Storage.submitHighscore({ ...first, score: 5000, clockLabel: '09:00' }), false, 'gleich gut zählt nicht');
  assert.equal(Storage.getHighscore().clockLabel, '08:55');
  assert.equal(Storage.submitHighscore({ ...first, score: 6200, rank: 'Fortgeschrittene:r Ersti' }), true);
  assert.equal(Storage.getHighscore().score, 6200);
  const raw = JSON.parse(globalThis.localStorage.getItem(PREFIX + 'highscore'));
  assert.equal(raw.score, 6200, 'unter dem Präfix gespeichert');
});

test('submitHighscore ergänzt fehlende Felder und lehnt ungültige Einträge ab', () => {
  assert.equal(Storage.submitHighscore({ score: 'viel' }), false);
  assert.equal(Storage.submitHighscore(null), false);
  assert.equal(Storage.submitHighscore({ score: NaN }), false);
  assert.equal(Storage.getHighscore(), null);
  assert.equal(Storage.submitHighscore({ score: 7100.4, won: 1 }), true);
  const stored = Storage.getHighscore();
  assert.equal(stored.score, 7100);
  assert.equal(stored.won, true);
  assert.equal(typeof stored.rank, 'string');
  assert.equal(typeof stored.clockLabel, 'string');
  assert.ok(!Number.isNaN(Date.parse(stored.date)), 'date ist ein ISO-Datum');
});

test('kaputter Highscore im Speicher gilt als „kein Highscore“', () => {
  globalThis.localStorage.setItem(PREFIX + 'highscore', JSON.stringify({ score: 'abc' }));
  assert.equal(Storage.getHighscore(), null);
  assert.equal(Storage.submitHighscore({ score: 10, rank: 'Brieftaube empfohlen', clockLabel: '07:30', won: false }), true);
});

test('Erfolge: global gesammelt, addAchievement nur beim ersten Mal true', () => {
  assert.deepEqual(Storage.getAchievements(), []);
  assert.equal(Storage.addAchievement('TOS_READER'), true);
  assert.equal(Storage.addAchievement('TOS_READER'), false);
  assert.equal(Storage.addAchievement('ON_TIME'), true);
  assert.deepEqual(Storage.getAchievements(), ['TOS_READER', 'ON_TIME']);
  assert.equal(Storage.addAchievement(''), false);
  assert.equal(Storage.addAchievement(undefined), false);
  const list = Storage.getAchievements();
  list.push('MANIPULIERT');
  assert.deepEqual(Storage.getAchievements(), ['TOS_READER', 'ON_TIME'], 'Kopie zurückgeben');
});

test('Erfolge: kaputte Daten im Speicher ergeben eine leere bzw. bereinigte Liste', () => {
  globalThis.localStorage.setItem(PREFIX + 'achievements', '"kein Array"');
  assert.deepEqual(Storage.getAchievements(), []);
  globalThis.localStorage.setItem(PREFIX + 'achievements', JSON.stringify(['A', 3, 'A', null, 'B']));
  assert.deepEqual(Storage.getAchievements(), ['A', 'B']);
});

test('unlockChapter setzt max(alt, id), mindestens 1, höchstens Kapitelanzahl', () => {
  assert.equal(Storage.getUnlockedChapter(), 1);
  Storage.unlockChapter(3);
  assert.equal(Storage.getUnlockedChapter(), 3);
  Storage.unlockChapter(2);
  assert.equal(Storage.getUnlockedChapter(), 3, 'nie zurückstufen');
  Storage.unlockChapter(CHAPTER_COUNT + 1);
  assert.equal(Storage.getUnlockedChapter(), CHAPTER_COUNT, 'nach Kapitel 5 bleibt es bei 5');
  Storage.unlockChapter('quatsch');
  assert.equal(Storage.getUnlockedChapter(), CHAPTER_COUNT);
});

test('getUnlockedChapter mit kaputten Daten liefert 1', () => {
  globalThis.localStorage.setItem(PREFIX + 'unlockedChapter', '"drei"');
  assert.equal(Storage.getUnlockedChapter(), 1);
  globalThis.localStorage.setItem(PREFIX + 'unlockedChapter', '-4');
  assert.equal(Storage.getUnlockedChapter(), 1);
});

test('Settings: Standardwerte und Merge', () => {
  assert.deepEqual(Storage.getSettings(), { muted: false });
  const merged = Storage.setSettings({ muted: true });
  assert.deepEqual(merged, { muted: true });
  Storage.setSettings({ language: 'de' });
  assert.deepEqual(Storage.getSettings(), { muted: true, language: 'de' });
  Storage.setSettings({ muted: false });
  assert.deepEqual(Storage.getSettings(), { muted: false, language: 'de' });
  const copy = Storage.getSettings();
  copy.muted = true;
  assert.equal(Storage.getSettings().muted, false, 'Kopie zurückgeben');
});

test('Settings: kaputte Daten ergeben die Standardwerte', () => {
  globalThis.localStorage.setItem(PREFIX + 'settings', '[1,2]');
  assert.deepEqual(Storage.getSettings(), { muted: false });
  assert.doesNotThrow(() => Storage.setSettings(null));
  assert.deepEqual(Storage.getSettings(), { muted: false });
});

test('resetAll löscht nur Schlüssel mit Präfix', () => {
  globalThis.localStorage.setItem('fremdeApp.daten', 'bleibt');
  Storage.set('a', 1);
  Storage.addAchievement('PHISHED');
  Storage.unlockChapter(4);
  Storage.submitHighscore({ score: 100, rank: 'x', clockLabel: '07:30', won: false });
  Storage.resetAll();
  assert.equal(Storage.get('a', 'leer'), 'leer');
  assert.deepEqual(Storage.getAchievements(), []);
  assert.equal(Storage.getUnlockedChapter(), 1);
  assert.equal(Storage.getHighscore(), null);
  assert.equal(globalThis.localStorage.getItem('fremdeApp.daten'), 'bleibt');
});
