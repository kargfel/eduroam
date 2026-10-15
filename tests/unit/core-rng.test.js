/**
 * core-rng.test.js – Unit-Tests für RNG (src/core/rng.js).
 *
 * Prüft: zufälliger Start-Seed, Determinismus mit Zahlen- und String-Seed, Wertebereiche
 * von next/int/float, chance-Grenzfälle, pick und shuffle (neues Array, Original bleibt).
 * Aufruf: node --test "tests/unit/core-rng.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, CORE_LOGIC_FILES } = require('./_load.js');

const { RNG } = loadScripts(CORE_LOGIC_FILES, ['RNG']);

/** Liefert n Werte aus RNG.next(). */
function sample(count) {
  return Array.from({ length: count }, () => RNG.next());
}

// Muss als erster Test laufen: noch hat niemand RNG.seed() aufgerufen.
test('ohne seed()-Aufruf ist bereits ein zufälliger Seed gesetzt', () => {
  const seed = RNG.getSeed();
  assert.equal(typeof seed, 'number');
  assert.ok(Number.isInteger(seed) && seed >= 0, `Seed ${seed} ist keine nichtnegative Ganzzahl`);
  const value = RNG.next();
  assert.ok(value >= 0 && value < 1);
});

test('gleicher Zahlen-Seed liefert dieselbe Folge', () => {
  RNG.seed(42);
  const first = sample(25);
  RNG.seed(42);
  const second = sample(25);
  assert.deepEqual(second, first);
  assert.equal(RNG.getSeed(), 42);
});

test('seed() setzt eine laufende Folge zurück', () => {
  RNG.seed(1234);
  const first = sample(5);
  sample(100);
  RNG.seed(1234);
  assert.deepEqual(sample(5), first);
});

test('String-Seeds sind deterministisch und ergeben einen Zahlen-Seed', () => {
  RNG.seed('eduroam');
  const seed = RNG.getSeed();
  assert.equal(typeof seed, 'number');
  assert.ok(Number.isInteger(seed));
  const first = sample(10);
  RNG.seed('eduroam');
  assert.equal(RNG.getSeed(), seed);
  assert.deepEqual(sample(10), first);
  RNG.seed('Eduroam');
  assert.notDeepEqual(sample(10), first, 'anderer String muss andere Folge liefern');
});

test('numerischer String-Seed (z. B. aus ?seed=7) entspricht dem Zahlen-Seed', () => {
  RNG.seed('7');
  const fromString = sample(8);
  assert.equal(RNG.getSeed(), 7);
  RNG.seed(7);
  assert.deepEqual(sample(8), fromString);
});

test('verschiedene Seeds liefern verschiedene Folgen', () => {
  RNG.seed(1);
  const a = sample(10);
  RNG.seed(2);
  const b = sample(10);
  assert.notDeepEqual(a, b);
});

test('seed() ohne brauchbaren Wert wählt einen zufälligen Seed und wirft nicht', () => {
  for (const value of [undefined, null, '', NaN]) {
    assert.doesNotThrow(() => RNG.seed(value));
    const seed = RNG.getSeed();
    assert.ok(Number.isInteger(seed) && seed >= 0);
  }
});

test('next() liegt immer in [0, 1)', () => {
  RNG.seed(123);
  for (const value of sample(5000)) assert.ok(value >= 0 && value < 1, `Wert ${value}`);
});

test('int() liefert ganze Zahlen, beide Grenzen inklusive', () => {
  RNG.seed(99);
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const value = RNG.int(1, 6);
    assert.ok(Number.isInteger(value), `${value} ist keine Ganzzahl`);
    assert.ok(value >= 1 && value <= 6, `${value} außerhalb von 1..6`);
    seen.add(value);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6], 'beide Grenzen müssen vorkommen');
  assert.equal(RNG.int(5, 5), 5);
  for (let i = 0; i < 500; i++) {
    const negative = RNG.int(-3, 3);
    assert.ok(negative >= -3 && negative <= 3);
    const swapped = RNG.int(6, 1);
    assert.ok(Number.isInteger(swapped) && swapped >= 1 && swapped <= 6, 'vertauschte Grenzen');
  }
});

test('float() liegt in [min, max)', () => {
  RNG.seed(7);
  for (let i = 0; i < 2000; i++) {
    const value = RNG.float(2.5, 3);
    assert.ok(value >= 2.5 && value < 3, `Wert ${value}`);
  }
});

test('chance() respektiert 0, 1 und ungefähr p', () => {
  RNG.seed(5);
  for (let i = 0; i < 500; i++) {
    assert.equal(RNG.chance(0), false);
    assert.equal(RNG.chance(1), true);
  }
  let hits = 0;
  for (let i = 0; i < 4000; i++) if (RNG.chance(0.25)) hits++;
  assert.ok(hits > 850 && hits < 1150, `25 % erwartet, ${hits}/4000 getroffen`);
});

test('pick() liefert ein Element des Arrays, bei leerem Array undefined', () => {
  RNG.seed(11);
  const items = ['eduroam', 'DHBW-Gast', 'FRITZ!Box 7590 XY'];
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const item = RNG.pick(items);
    assert.ok(items.includes(item));
    seen.add(item);
  }
  assert.equal(seen.size, items.length, 'alle Elemente sollten vorkommen');
  assert.equal(RNG.pick([]), undefined);
  assert.equal(RNG.pick(null), undefined);
});

test('shuffle() liefert ein NEUES gemischtes Array, das Original bleibt unverändert', () => {
  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const copy = [...original];
  RNG.seed(2024);
  const shuffled = RNG.shuffle(original);
  assert.notEqual(shuffled, original, 'muss ein neues Array sein');
  assert.deepEqual(original, copy, 'Original darf nicht verändert werden');
  assert.deepEqual([...shuffled].sort((a, b) => a - b), copy, 'gleiche Elemente');
  assert.notDeepEqual(shuffled, copy, 'sollte tatsächlich mischen');
  RNG.seed(2024);
  assert.deepEqual(RNG.shuffle(original), shuffled, 'deterministisch mit gleichem Seed');
});

test('shuffle() funktioniert mit eingefrorenen Arrays (CONFIG/CAMPUS) und leeren Eingaben', () => {
  const frozen = Object.freeze(['Brezel', 'Spätzle', 'Maultasche']);
  const shuffled = RNG.shuffle(frozen);
  assert.equal(shuffled.length, 3);
  assert.ok(!Object.isFrozen(shuffled));
  assert.deepEqual([...shuffled].sort(), [...frozen].sort());
  assert.deepEqual(RNG.shuffle([]), []);
  assert.deepEqual(RNG.shuffle(undefined), []);
});

test('Zusatz: RNG.create(seed) liefert unabhängige, deterministische Generatoren', () => {
  const a = RNG.create(77);
  const b = RNG.create(77);
  RNG.seed(1);
  const globalBefore = RNG.next();
  const fromA = [a.next(), a.int(1, 100), a.float(0, 1)];
  const fromB = [b.next(), b.int(1, 100), b.float(0, 1)];
  assert.deepEqual(fromA, fromB);
  assert.equal(a.getSeed(), 77);
  // Der globale Generator wird durch eigene Instanzen nicht verschoben.
  RNG.seed(1);
  assert.equal(RNG.next(), globalBefore);
});
