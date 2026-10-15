/**
 * core-scoring.test.js – Unit-Tests für Scoring (src/core/scoring.js).
 *
 * Prüft: Score-Formel exakt laut Vertrag 5.6 (Erwartung aus CONFIG.SCORE nachgerechnet),
 * Verlustfaktor, Rundung, Untergrenze 0, Rang-Grenzen, formatClock inkl. Tagesüberlauf
 * und minutesLate.
 * Aufruf: node --test "tests/unit/core-scoring.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, CORE_LOGIC_FILES } = require('./_load.js');

const { Scoring, CONFIG } = loadScripts(CORE_LOGIC_FILES, ['Scoring', 'CONFIG']);
const S = CONFIG.SCORE;
const START = CONFIG.CLOCK.START_MINUTES;
const LECTURE = CONFIG.CLOCK.LECTURE_MINUTES;

/** Vertragsformel 5.6, unabhängig von der Implementierung nachgerechnet. */
function expectedScore({ clockMinutes, totalFails, frustrationPeak, achievementCount, won }) {
  let raw =
    S.BASE -
    (clockMinutes - START) * S.PER_MINUTE -
    totalFails * S.PER_FAIL -
    frustrationPeak * S.PER_FRUSTRATION +
    achievementCount * S.PER_ACHIEVEMENT +
    (won ? S.WIN_BONUS : 0);
  if (!won) raw *= S.LOSS_FACTOR;
  return Math.max(0, Math.round(raw));
}

test('computeScore: Sieg exakt nach Formel (Beispiel 08:55, 3 Fails, 42 % Frust, 2 Erfolge)', () => {
  const input = { clockMinutes: 535, totalFails: 3, frustrationPeak: 42, achievementCount: 2, won: true };
  assert.equal(Scoring.computeScore(input), expectedScore(input));
  // Plausibilitätsanker mit den aktuellen CONFIG-Werten (10000 − 680 − 360 − 630 + 600 + 1000)
  if (S.BASE === 10000 && S.PER_MINUTE === 8 && S.PER_FAIL === 120 && S.PER_FRUSTRATION === 15 && S.PER_ACHIEVEMENT === 300 && S.WIN_BONUS === 1000) {
    assert.equal(Scoring.computeScore(input), 9930);
  }
});

test('computeScore: Niederlage ohne Siegbonus, mal LOSS_FACTOR, gerundet', () => {
  const input = { clockMinutes: 600, totalFails: 7, frustrationPeak: 100, achievementCount: 1, won: false };
  const score = Scoring.computeScore(input);
  assert.equal(score, expectedScore(input));
  assert.ok(Number.isInteger(score));
  const withWin = Scoring.computeScore({ ...input, won: true });
  assert.ok(withWin > score, 'Sieg muss mehr Punkte bringen');
});

test('computeScore: Rundung bei Bruchteilen (Verlustfaktor, gebrochene Minuten)', () => {
  const cases = [
    { clockMinutes: 451, totalFails: 0, frustrationPeak: 1, achievementCount: 0, won: false },
    { clockMinutes: 455.5, totalFails: 1, frustrationPeak: 3, achievementCount: 0, won: true },
    { clockMinutes: 777.3, totalFails: 2, frustrationPeak: 33, achievementCount: 4, won: false },
  ];
  for (const input of cases) {
    const score = Scoring.computeScore(input);
    assert.ok(Number.isInteger(score), `${score} ist nicht gerundet`);
    assert.equal(score, expectedScore(input), JSON.stringify(input));
  }
});

test('computeScore: nie kleiner als 0', () => {
  assert.equal(
    Scoring.computeScore({ clockMinutes: START + 100000, totalFails: 500, frustrationPeak: 100, achievementCount: 0, won: true }),
    0
  );
  assert.equal(
    Scoring.computeScore({ clockMinutes: START + 5000, totalFails: 50, frustrationPeak: 100, achievementCount: 0, won: false }),
    0
  );
});

test('computeScore: fehlende Werte gelten als neutral (Start-Uhrzeit, 0 Fails, verloren)', () => {
  assert.equal(Scoring.computeScore({ won: true }), S.BASE + S.WIN_BONUS);
  assert.equal(Scoring.computeScore({}), Math.round(S.BASE * S.LOSS_FACTOR));
  assert.equal(Scoring.computeScore(), Math.round(S.BASE * S.LOSS_FACTOR));
});

test('Zusatz: breakdown() ist konsistent mit computeScore()', () => {
  const input = { clockMinutes: 520, totalFails: 4, frustrationPeak: 37, achievementCount: 3, won: true };
  const parts = Scoring.breakdown(input);
  assert.equal(parts.total, Scoring.computeScore(input));
  assert.equal(parts.base, S.BASE);
  assert.equal(parts.timePenalty, (520 - START) * S.PER_MINUTE);
  assert.equal(parts.failPenalty, 4 * S.PER_FAIL);
  assert.equal(parts.frustrationPenalty, 37 * S.PER_FRUSTRATION);
  assert.equal(parts.achievementBonus, 3 * S.PER_ACHIEVEMENT);
  assert.equal(parts.winBonus, S.WIN_BONUS);
  assert.equal(parts.factor, 1);
  assert.equal(Scoring.breakdown({ ...input, won: false }).factor, S.LOSS_FACTOR);
});

test('rankTitle: Grenzen aus CONFIG.RANKS', () => {
  const ranks = [...CONFIG.RANKS].sort((a, b) => b.min - a.min);
  for (const rank of ranks) {
    assert.equal(Scoring.rankTitle(rank.min), rank.title, `genau ${rank.min}`);
    assert.equal(Scoring.rankTitle(rank.min + 1), rank.title, `${rank.min} + 1`);
  }
  for (let i = 0; i < ranks.length - 1; i++) {
    assert.equal(Scoring.rankTitle(ranks[i].min - 1), ranks[i + 1].title, `knapp unter ${ranks[i].min}`);
  }
  const lowest = ranks[ranks.length - 1];
  assert.equal(Scoring.rankTitle(-50), lowest.title, 'unterhalb aller Ränge: niedrigster');
  assert.equal(Scoring.rankTitle(999999), ranks[0].title);
  assert.equal(Scoring.rankTitle(9500), 'Netzwerk-Gottheit');
  assert.equal(Scoring.rankTitle(0), 'Brieftaube empfohlen');
});

test('formatClock: HH:MM mit führenden Nullen', () => {
  assert.equal(Scoring.formatClock(535), '08:55');
  assert.equal(Scoring.formatClock(START), '07:30');
  assert.equal(Scoring.formatClock(0), '00:00');
  assert.equal(Scoring.formatClock(61), '01:01');
  assert.equal(Scoring.formatClock(1439), '23:59');
  assert.equal(Scoring.formatClock(535.9), '08:55', 'Bruchteile werden abgeschnitten');
});

test('formatClock: Tagesüberlauf ab 1440 als „Tag N, HH:MM“', () => {
  assert.equal(Scoring.formatClock(1440), 'Tag 2, 00:00');
  assert.equal(Scoring.formatClock(1440 + 451), 'Tag 2, 07:31');
  assert.equal(Scoring.formatClock(2 * 1440 + 5), 'Tag 3, 00:05');
});

test('Zusatz: formatClock(minutes, { withDay: false }) lässt den Tag weg', () => {
  assert.equal(Scoring.formatClock(1440 + 451, { withDay: false }), '07:31');
  assert.equal(Scoring.formatClock(535, { withDay: false }), '08:55');
  assert.equal(Scoring.formatClock(1440 + 451, {}), 'Tag 2, 07:31');
});

test('formatClock: ungültige Werte werfen nicht', () => {
  assert.equal(Scoring.formatClock(-5), '00:00');
  assert.equal(Scoring.formatClock(NaN), '00:00');
  assert.equal(Scoring.formatClock(undefined), '00:00');
});

test('minutesLate: max(0, minutes − LECTURE_MINUTES)', () => {
  assert.equal(Scoring.minutesLate(START), 0);
  assert.equal(Scoring.minutesLate(LECTURE - 1), 0);
  assert.equal(Scoring.minutesLate(LECTURE), 0);
  assert.equal(Scoring.minutesLate(LECTURE + 7), 7);
  assert.equal(Scoring.minutesLate(LECTURE + 1440), 1440);
  assert.equal(Scoring.minutesLate(LECTURE + 2.75), 2, 'ganze Minuten');
});

test('Zusatz: formatDuration für Statistik-Anzeigen', () => {
  assert.equal(Scoring.formatDuration(0), '0 min');
  assert.equal(Scoring.formatDuration(45), '45 min');
  assert.equal(Scoring.formatDuration(60), '1 h 0 min');
  assert.equal(Scoring.formatDuration(85), '1 h 25 min');
  assert.equal(Scoring.formatDuration(1505), '25 h 5 min');
});
