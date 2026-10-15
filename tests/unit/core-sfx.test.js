/**
 * core-sfx.test.js – Unit-Tests für SFX (src/audio/sfx.js) in Node, also OHNE AudioContext.
 *
 * Prüft: alle Methoden laut Vertrag 5.8 vorhanden und werfen nie; Stummschaltung über
 * Storage-Settings; RUNTIME.muted erzwingt Stille, ohne die Settings zu überschreiben.
 * Klang selbst wird im Browser getestet (tests/e2e/sfx.mjs).
 * Aufruf: node --test "tests/unit/core-sfx.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, CORE_LOGIC_FILES } = require('./_load.js');

const { SFX, RUNTIME, Storage } = loadScripts([...CORE_LOGIC_FILES, 'src/audio/sfx.js'], ['SFX', 'RUNTIME', 'Storage']);

const CONTROL_METHODS = ['init', 'unlock', 'setMuted', 'isMuted', 'toggleMuted', 'startHoldMusic', 'stopHoldMusic'];
const SOUND_METHODS = [
  'click', 'hover', 'type', 'error', 'fail', 'success', 'notify', 'popup', 'connect', 'disconnect',
  'pickup', 'alarm', 'stamp', 'modem', 'win', 'lose', 'whoosh', 'tick',
];

test.beforeEach(() => {
  Storage.resetAll();
  RUNTIME.muted = false;
});

test('alle Methoden laut Vertrag sind vorhanden', () => {
  for (const name of [...CONTROL_METHODS, ...SOUND_METHODS]) {
    assert.equal(typeof SFX[name], 'function', `SFX.${name} fehlt`);
  }
});

test('ohne AudioContext wirft keine Methode (auch ohne vorheriges init)', () => {
  assert.equal(typeof globalThis.AudioContext, 'undefined', 'Node hat keinen AudioContext');
  for (const name of SOUND_METHODS) assert.doesNotThrow(() => SFX[name](), name);
  for (const name of CONTROL_METHODS) assert.doesNotThrow(() => SFX[name](), name);
  assert.doesNotThrow(() => SFX.stopHoldMusic());
  assert.doesNotThrow(() => SFX.stopHoldMusic());
});

test('Methoden werfen auch als losgelöste Callbacks nicht', () => {
  const { click, stamp, startHoldMusic, stopHoldMusic } = SFX;
  assert.doesNotThrow(() => {
    click();
    stamp();
    startHoldMusic();
    stopHoldMusic();
  });
});

test('unlock() liefert ein Promise, das nie ablehnt', async () => {
  const result = SFX.unlock();
  assert.ok(result && typeof result.then === 'function');
  assert.equal(await result, false, 'ohne AudioContext nicht entsperrbar');
});

test('init() liest die Stummschaltung aus den Storage-Settings', () => {
  Storage.setSettings({ muted: true });
  SFX.init();
  assert.equal(SFX.isMuted(), true);
  Storage.setSettings({ muted: false });
  SFX.init();
  assert.equal(SFX.isMuted(), false);
});

test('setMuted speichert in Storage.setSettings, toggleMuted liefert den neuen Zustand', () => {
  SFX.init();
  SFX.setMuted(true);
  assert.equal(SFX.isMuted(), true);
  assert.equal(Storage.getSettings().muted, true);
  assert.equal(SFX.toggleMuted(), false);
  assert.equal(Storage.getSettings().muted, false);
  assert.equal(SFX.toggleMuted(), true);
  assert.equal(Storage.getSettings().muted, true);
});

test('RUNTIME.muted erzwingt Stille, ohne die Settings zu überschreiben', () => {
  SFX.init();
  SFX.setMuted(false);
  RUNTIME.muted = true;
  assert.equal(SFX.isMuted(), true);
  assert.equal(Storage.getSettings().muted, false, 'Settings unverändert');
  for (const name of SOUND_METHODS) assert.doesNotThrow(() => SFX[name]());
  RUNTIME.muted = false;
  assert.equal(SFX.isMuted(), false);
});

test('Zusatz: getDebugInfo() beschreibt den Zustand ohne Audio', () => {
  SFX.init();
  const info = SFX.getDebugInfo();
  assert.equal(info.hasContext, false);
  assert.equal(info.errors, 0, 'keine verschluckten Fehler');
  SFX.startHoldMusic();
  assert.equal(SFX.isHoldMusicPlaying(), true, 'gewünscht, spielt sobald Audio verfügbar');
  SFX.stopHoldMusic();
  assert.equal(SFX.isHoldMusicPlaying(), false);
});
