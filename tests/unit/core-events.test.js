/**
 * core-events.test.js – Unit-Tests für Emitter und EVENTS (src/core/events.js).
 *
 * Prüft: on/once/off/emit, Kontext-Bindung, Verkettung, Fehler im Handler werden gefangen
 * (console.error), Entfernen während emit, removeAllListeners, Vererbung, EVENTS-Namen.
 * Aufruf: node --test "tests/unit/core-events.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, CORE_LOGIC_FILES } = require('./_load.js');

const { Emitter, EVENTS } = loadScripts(CORE_LOGIC_FILES, ['Emitter', 'EVENTS']);

/** Fängt console.error-Aufrufe während fn ab. */
function captureConsoleError(fn) {
  const calls = [];
  const original = console.error;
  console.error = (...args) => calls.push(args);
  try {
    fn();
  } finally {
    console.error = original;
  }
  return calls;
}

test('EVENTS enthält genau die Ereignisnamen laut Vertrag und ist eingefroren', () => {
  assert.deepEqual(
    { ...EVENTS },
    {
      STATE_CHANGED: 'state-changed',
      FRUSTRATION_CHANGED: 'frustration-changed',
      CLOCK_JUMP: 'clock-jump',
      CLOCK_MILESTONE: 'clock-milestone',
      OBJECTIVE_CHANGED: 'objective-changed',
      RAGE_QUIT: 'rage-quit',
      CHAPTER_COMPLETE: 'chapter-complete',
      ACHIEVEMENT: 'achievement-unlocked',
      PAUSE_CHANGED: 'pause-changed',
    }
  );
  assert.ok(Object.isFrozen(EVENTS));
});

test('on() + emit() rufen Handler mit Payload in Registrierungsreihenfolge auf; on() verkettbar', () => {
  const emitter = new Emitter();
  const calls = [];
  const returned = emitter.on('x', (payload) => calls.push(['a', payload]));
  assert.equal(returned, emitter, 'on() muss this liefern');
  emitter.on('x', (payload) => calls.push(['b', payload])).on('y', () => calls.push(['y']));
  emitter.emit('x', { value: 1 });
  assert.deepEqual(calls, [['a', { value: 1 }], ['b', { value: 1 }]]);
});

test('emit() ohne Handler ist harmlos; Rückgabe zeigt, ob jemand zugehört hat', () => {
  const emitter = new Emitter();
  assert.doesNotThrow(() => emitter.emit('niemand-hoert-zu', 1));
  assert.equal(emitter.emit('niemand-hoert-zu'), false);
  emitter.on('x', () => {});
  assert.equal(emitter.emit('x'), true);
});

test('Kontext wird als this an den Handler übergeben', () => {
  const emitter = new Emitter();
  const hud = { name: 'HUD', seen: null };
  emitter.on(
    'x',
    function handler(payload) {
      this.seen = `${this.name}:${payload}`;
    },
    hud
  );
  emitter.emit('x', 42);
  assert.equal(hud.seen, 'HUD:42');
});

test('once() feuert genau einmal (auch mit Kontext) und ist verkettbar', () => {
  const emitter = new Emitter();
  const ctx = { count: 0 };
  const returned = emitter.once(
    'x',
    function handler() {
      this.count++;
    },
    ctx
  );
  assert.equal(returned, emitter);
  emitter.emit('x');
  emitter.emit('x');
  emitter.emit('x');
  assert.equal(ctx.count, 1);
  assert.equal(emitter.emit('x'), false, 'once-Handler muss danach weg sein');
});

test('once()-Handler, der dasselbe Event erneut auslöst, läuft nicht doppelt', () => {
  const emitter = new Emitter();
  let count = 0;
  emitter.once('x', () => {
    count++;
    emitter.emit('x');
  });
  emitter.emit('x');
  assert.equal(count, 1);
});

test('off(event, handler) entfernt nur diesen Handler; off() ist verkettbar', () => {
  const emitter = new Emitter();
  const calls = [];
  const a = () => calls.push('a');
  const b = () => calls.push('b');
  emitter.on('x', a).on('x', b);
  assert.equal(emitter.off('x', a), emitter);
  emitter.emit('x');
  assert.deepEqual(calls, ['b']);
});

test('off() entfernt auch once-Handler', () => {
  const emitter = new Emitter();
  let count = 0;
  const handler = () => count++;
  emitter.once('x', handler);
  emitter.off('x', handler);
  emitter.emit('x');
  assert.equal(count, 0);
});

test('off(event, handler, context) entfernt nur die Registrierung mit diesem Kontext', () => {
  const emitter = new Emitter();
  const sceneA = { hits: 0 };
  const sceneB = { hits: 0 };
  function handler() {
    this.hits++;
  }
  emitter.on('x', handler, sceneA).on('x', handler, sceneB);
  emitter.off('x', handler, sceneA);
  emitter.emit('x');
  assert.equal(sceneA.hits, 0);
  assert.equal(sceneB.hits, 1);
  // ohne Kontext: alle Registrierungen dieses Handlers
  emitter.on('x', handler, sceneA);
  emitter.off('x', handler);
  emitter.emit('x');
  assert.equal(sceneA.hits, 0);
  assert.equal(sceneB.hits, 1);
});

test('off(event) ohne Handler entfernt alle Handler des Events, andere Events bleiben', () => {
  const emitter = new Emitter();
  const calls = [];
  emitter.on('x', () => calls.push('x1')).on('x', () => calls.push('x2')).on('y', () => calls.push('y'));
  emitter.off('x');
  emitter.emit('x');
  emitter.emit('y');
  assert.deepEqual(calls, ['y']);
});

test('off() mit unbekanntem Event oder Handler ist harmlos', () => {
  const emitter = new Emitter();
  assert.doesNotThrow(() => emitter.off('gibt-es-nicht', () => {}));
  assert.doesNotThrow(() => emitter.off('gibt-es-nicht'));
  assert.doesNotThrow(() => emitter.off());
});

test('removeAllListeners() entfernt alle Handler aller Events', () => {
  const emitter = new Emitter();
  let count = 0;
  emitter.on('x', () => count++).on('y', () => count++).once('z', () => count++);
  emitter.removeAllListeners();
  emitter.emit('x');
  emitter.emit('y');
  emitter.emit('z');
  assert.equal(count, 0);
  // danach weiter benutzbar
  emitter.on('x', () => count++);
  emitter.emit('x');
  assert.equal(count, 1);
});

test('Fehler im Handler wird gefangen und per console.error gemeldet; weitere Handler laufen', () => {
  const emitter = new Emitter();
  const calls = [];
  emitter.on('x', () => {
    throw new Error('kaputt');
  });
  emitter.on('x', (payload) => calls.push(payload));
  let errorCalls;
  assert.doesNotThrow(() => {
    errorCalls = captureConsoleError(() => emitter.emit('x', 'weiter'));
  });
  assert.deepEqual(calls, ['weiter'], 'zweiter Handler muss trotzdem laufen');
  assert.equal(errorCalls.length, 1, 'genau ein console.error');
  const flattened = errorCalls[0];
  assert.ok(
    flattened.some((arg) => arg instanceof Error && arg.message === 'kaputt'),
    'der ursprüngliche Fehler muss mitgeloggt werden'
  );
  assert.ok(flattened.some((arg) => typeof arg === 'string' && arg.includes('x')), 'Eventname im Log');
});

test('während emit() entfernte Handler laufen nicht mehr; neue erst beim nächsten emit', () => {
  const emitter = new Emitter();
  const calls = [];
  const second = () => calls.push('second');
  const late = () => calls.push('late');
  emitter.on('x', () => {
    calls.push('first');
    emitter.off('x', second);
    emitter.on('x', late);
  });
  emitter.on('x', second);
  emitter.emit('x');
  assert.deepEqual(calls, ['first']);
  calls.length = 0;
  emitter.emit('x');
  assert.deepEqual(calls, ['first', 'late']);
});

test('Handler, die keine Funktion sind, werden ignoriert', () => {
  const emitter = new Emitter();
  assert.doesNotThrow(() => emitter.on('x', null).once('x', 'kein Handler'));
  assert.equal(emitter.emit('x'), false);
});

test('Unterklassen erben alle Emitter-Funktionen', () => {
  class Store extends Emitter {
    change(value) {
      this.emit('changed', value);
    }
  }
  const store = new Store();
  const seen = [];
  store.on('changed', (value) => seen.push(value));
  store.change(3);
  assert.ok(store instanceof Emitter);
  assert.deepEqual(seen, [3]);
});

test('Zusatz: listenerCount() zählt aktive Handler', () => {
  const emitter = new Emitter();
  const handler = () => {};
  emitter.on('x', handler).once('x', () => {});
  assert.equal(emitter.listenerCount('x'), 2);
  emitter.emit('x');
  assert.equal(emitter.listenerCount('x'), 1);
  emitter.off('x', handler);
  assert.equal(emitter.listenerCount('x'), 0);
  assert.equal(emitter.listenerCount('unbekannt'), 0);
});
