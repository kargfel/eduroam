/**
 * core-gameState.test.js – Unit-Tests für GameState (src/core/gameState.js).
 *
 * Prüft den Vertrag 5.7: startRun-Reset, tick nur wenn running und nicht pausiert,
 * advanceClock + CLOCK_JUMP, Meilensteine genau einmal pro Lauf (mit Frust),
 * addFrustration (Clamp, RAGE_QUIT genau einmal), recordFail/totalFails, completeChapter,
 * unlockAchievement (einmal pro Lauf, isNewGlobal), Credentials-Fallback, Flags, Objective,
 * Pause, finishRun (Score, globale Erfolge, Highscore, vollständiges Ergebnis) und
 * getSnapshot als tiefe Kopie.
 * Aufruf: node --test "tests/unit/core-gameState.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, CORE_LOGIC_FILES } = require('./_load.js');

const { GameState, Emitter, EVENTS, Storage, Scoring, CONFIG, CAMPUS } = loadScripts(CORE_LOGIC_FILES, [
  'GameState',
  'Emitter',
  'EVENTS',
  'Storage',
  'Scoring',
  'CONFIG',
  'CAMPUS',
]);

const START = CONFIG.CLOCK.START_MINUTES;
const LECTURE = CONFIG.CLOCK.LECTURE_MINUTES;
const MS_PER_MINUTE = CONFIG.CLOCK.REAL_MS_PER_GAME_MINUTE;
const MAX = CONFIG.FRUSTRATION.MAX;
const MILESTONES = [...CONFIG.CLOCK.MILESTONES].sort((a, b) => a.minutes - b.minutes);
const CHAPTER_IDS = CONFIG.CHAPTERS.map((chapter) => chapter.id);

/** Abonniert alle GameState-Events und protokolliert sie. */
function recordEvents() {
  const log = [];
  for (const name of Object.values(EVENTS)) {
    GameState.on(name, (payload) => log.push({ event: name, payload }));
  }
  return {
    log,
    of: (name) => log.filter((entry) => entry.event === name).map((entry) => entry.payload),
    clear: () => {
      log.length = 0;
    },
  };
}

/** Fängt console.error während fn ab (erwartete Meldungen bei ungültigen IDs) und liefert die Aufrufe. */
function captureErrors(fn) {
  const calls = [];
  const original = console.error;
  console.error = (...args) => calls.push(args.join(' '));
  try {
    fn();
  } finally {
    console.error = original;
  }
  return calls;
}

test.beforeEach(() => {
  GameState.removeAllListeners();
  Storage.resetAll();
  globalThis.localStorage.clear();
});

// Muss als erster Test laufen: noch kein startRun().
test('vor dem ersten startRun: status idle, Startuhrzeit, tick wirkt nicht', () => {
  const snapshot = GameState.getSnapshot();
  assert.equal(snapshot.status, 'idle');
  assert.equal(snapshot.clockMinutes, START);
  GameState.tick(MS_PER_MINUTE * 10);
  assert.equal(GameState.getClockMinutes(), START);
});

test('GameState ist eine Instanz einer Emitter-Unterklasse', () => {
  assert.ok(GameState instanceof Emitter);
  assert.notEqual(Object.getPrototypeOf(GameState), Emitter.prototype, 'eigene Unterklasse erwartet');
  for (const method of ['on', 'once', 'off', 'emit', 'removeAllListeners']) {
    assert.equal(typeof GameState[method], 'function', method);
  }
});

test('startRun setzt alles zurück (status running, paused false)', () => {
  GameState.startRun();
  GameState.addFrustration(30, 'test');
  GameState.advanceClock(40, 'test');
  GameState.recordFail(1, 'test');
  GameState.recordSuccess(1);
  GameState.completeChapter(1, { fails: 1 });
  GameState.unlockAchievement('TOS_READER');
  GameState.setObjective('Irgendwas');
  GameState.setFlag('phished', true);
  GameState.setCredentials({ username: CAMPUS.username, password: 'Geheim#1' });
  GameState.setCurrentChapter(3);
  GameState.setPaused(true);

  GameState.startRun(2);
  const snapshot = GameState.getSnapshot();
  assert.equal(snapshot.status, 'running');
  assert.equal(snapshot.paused, false);
  assert.equal(snapshot.currentChapterId, 2);
  assert.equal(snapshot.clockMinutes, START);
  assert.equal(snapshot.clockLabel, Scoring.formatClock(START));
  assert.equal(snapshot.frustration, 0);
  assert.equal(snapshot.frustrationPeak, 0);
  assert.equal(snapshot.totalFails, 0);
  assert.deepEqual(snapshot.chapterStats, {});
  assert.deepEqual(snapshot.runAchievements, []);
  assert.equal(snapshot.objective, '');
  assert.deepEqual(snapshot.flags, {});
  for (const id of CHAPTER_IDS) assert.deepEqual(snapshot.attempts[id], { fails: 0, successes: 0 }, `attempts[${id}]`);
  assert.equal(GameState.isPaused(), false);
  assert.equal(GameState.getCredentials().isDefault, true);
  assert.equal(GameState.getFrustration(), 0);
});

test('startRun: Standard-Kapitel 1, ungültige Kapitel fallen auf 1 zurück', () => {
  GameState.startRun();
  assert.equal(GameState.getSnapshot().currentChapterId, 1);
  GameState.startRun(5);
  assert.equal(GameState.getSnapshot().currentChapterId, 5);
  GameState.startRun(99);
  assert.equal(GameState.getSnapshot().currentChapterId, 1);
});

test('startRun sendet STATE_CHANGED mit dem neuen Snapshot', () => {
  const events = recordEvents();
  GameState.startRun(3);
  const states = events.of(EVENTS.STATE_CHANGED);
  assert.ok(states.length >= 1);
  assert.equal(states[states.length - 1].status, 'running');
  assert.equal(states[states.length - 1].currentChapterId, 3);
});

test('tick erhöht die Spielminuten nur, wenn running und nicht pausiert', () => {
  GameState.startRun();
  GameState.tick(MS_PER_MINUTE);
  assert.equal(GameState.getClockMinutes(), START + 1);
  GameState.tick(MS_PER_MINUTE / 2);
  GameState.tick(MS_PER_MINUTE / 2);
  assert.equal(GameState.getClockMinutes(), START + 2);

  GameState.setPaused(true);
  GameState.tick(MS_PER_MINUTE * 10);
  assert.equal(GameState.getClockMinutes(), START + 2, 'pausiert: keine Zeit');
  GameState.setPaused(false);
  GameState.tick(MS_PER_MINUTE);
  assert.equal(GameState.getClockMinutes(), START + 3);

  GameState.tick(-MS_PER_MINUTE);
  GameState.tick(NaN);
  GameState.tick(undefined);
  assert.equal(GameState.getClockMinutes(), START + 3, 'ungültige Deltas ignorieren');

  GameState.abortRun();
  GameState.tick(MS_PER_MINUTE * 10);
  assert.equal(GameState.getClockMinutes(), START + 3, 'abgebrochen: keine Zeit');

  GameState.startRun();
  GameState.finishRun(true);
  const after = GameState.getClockMinutes();
  GameState.tick(MS_PER_MINUTE * 10);
  assert.equal(GameState.getClockMinutes(), after, 'beendet: keine Zeit');
});

test('tick sendet STATE_CHANGED nur, wenn sich die angezeigte Minute ändert', () => {
  GameState.startRun();
  const events = recordEvents();
  GameState.tick(MS_PER_MINUTE / 4);
  GameState.tick(MS_PER_MINUTE / 4);
  GameState.tick(MS_PER_MINUTE / 4);
  assert.equal(events.of(EVENTS.STATE_CHANGED).length, 0);
  GameState.tick(MS_PER_MINUTE / 2);
  assert.equal(events.of(EVENTS.STATE_CHANGED).length, 1);
  assert.equal(events.of(EVENTS.STATE_CHANGED)[0].clockMinutes, START + 1);
});

test('getClockMinutes liefert ganze Minuten; Zusatz getClockMinutesExact die genaue Zeit', () => {
  GameState.startRun();
  GameState.tick(MS_PER_MINUTE * 1.5);
  assert.equal(GameState.getClockMinutes(), START + 1);
  assert.equal(GameState.getClockMinutesExact(), START + 1.5);
  assert.equal(GameState.getClockLabel(), Scoring.formatClock(START + 1));
  assert.equal(GameState.getSnapshot().clockMinutes, START + 1);
});

test('advanceClock springt vor und sendet CLOCK_JUMP { minutes, reason }', () => {
  GameState.startRun();
  const events = recordEvents();
  const result = GameState.advanceClock(5, 'Fehlermeldung gegoogelt');
  assert.equal(GameState.getClockMinutes(), START + 5);
  assert.equal(result, START + 5, 'liefert die neue Uhrzeit');
  assert.deepEqual(events.of(EVENTS.CLOCK_JUMP), [{ minutes: 5, reason: 'Fehlermeldung gegoogelt' }]);
  assert.ok(events.of(EVENTS.STATE_CHANGED).length >= 1);

  GameState.advanceClock(0, 'nichts');
  GameState.advanceClock(-3, 'Zeitreise');
  GameState.advanceClock(NaN, 'kaputt');
  assert.equal(GameState.getClockMinutes(), START + 5);
  assert.equal(events.of(EVENTS.CLOCK_JUMP).length, 1);

  GameState.setPaused(true);
  GameState.advanceClock(2, 'Strafe trotz Pause');
  assert.equal(GameState.getClockMinutes(), START + 7, 'Zeitstrafen gelten auch pausiert');
});

test('Meilensteine: genau einmal pro Lauf, in Reihenfolge, mit Frust', () => {
  GameState.startRun();
  const events = recordEvents();
  const first = MILESTONES[0];

  GameState.advanceClock(first.minutes - START, 'warten');
  let fired = events.of(EVENTS.CLOCK_MILESTONE);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].minutes, first.minutes);
  assert.equal(fired[0].text, first.text);
  const jumpIndex = events.log.findIndex((entry) => entry.event === EVENTS.CLOCK_JUMP);
  const milestoneIndex = events.log.findIndex((entry) => entry.event === EVENTS.CLOCK_MILESTONE);
  assert.ok(jumpIndex < milestoneIndex, 'erst CLOCK_JUMP, dann CLOCK_MILESTONE');
  if (first.frustration > 0) {
    assert.deepEqual(
      events.of(EVENTS.FRUSTRATION_CHANGED).map((p) => [p.delta, p.reason]),
      [[first.frustration, 'milestone']]
    );
  }
  assert.equal(GameState.getFrustration(), first.frustration);

  GameState.advanceClock(1, 'noch ein bisschen');
  assert.equal(events.of(EVENTS.CLOCK_MILESTONE).length, 1, 'nicht erneut auslösen');

  // Ein großer Sprung (z. B. „24 h warten“) löst alle übrigen genau einmal aus.
  GameState.advanceClock(24 * 60, '24 h warten');
  fired = events.of(EVENTS.CLOCK_MILESTONE);
  assert.deepEqual(
    fired.map((p) => p.minutes),
    MILESTONES.map((m) => m.minutes)
  );
  const totalFrustration = MILESTONES.reduce((sum, m) => sum + m.frustration, 0);
  assert.equal(GameState.getFrustration(), Math.min(MAX, totalFrustration));

  GameState.advanceClock(3 * 24 * 60, 'noch länger');
  assert.equal(events.of(EVENTS.CLOCK_MILESTONE).length, MILESTONES.length, 'keine Wiederholung am nächsten Tag');

  // Neuer Lauf: Meilensteine sind wieder offen.
  GameState.startRun();
  events.clear();
  GameState.advanceClock(first.minutes - START, 'warten');
  assert.equal(events.of(EVENTS.CLOCK_MILESTONE).length, 1);
});

test('Meilensteine werden auch durch tick ausgelöst – genau einmal', () => {
  GameState.startRun();
  const events = recordEvents();
  const first = MILESTONES[0];
  GameState.tick((first.minutes - START - 0.5) * MS_PER_MINUTE);
  assert.equal(events.of(EVENTS.CLOCK_MILESTONE).length, 0, 'knapp davor');
  GameState.tick(MS_PER_MINUTE);
  assert.equal(events.of(EVENTS.CLOCK_MILESTONE).length, 1, 'überschritten');
  GameState.tick(MS_PER_MINUTE);
  GameState.tick(MS_PER_MINUTE);
  assert.equal(events.of(EVENTS.CLOCK_MILESTONE).length, 1, 'nicht doppelt');
});

test('addFrustration: Clamp 0..MAX, Payload { value, delta, reason }, Spitzenwert', () => {
  GameState.startRun();
  const events = recordEvents();
  assert.equal(GameState.addFrustration(30, 'CAPTCHA'), 30);
  assert.deepEqual(events.of(EVENTS.FRUSTRATION_CHANGED), [{ value: 30, delta: 30, reason: 'CAPTCHA' }]);
  GameState.addFrustration(MAX + 50, 'Nutzungsordnung');
  assert.equal(GameState.getFrustration(), MAX);
  assert.deepEqual(events.of(EVENTS.FRUSTRATION_CHANGED)[1], { value: MAX, delta: MAX - 30, reason: 'Nutzungsordnung' });
  assert.equal(GameState.getSnapshot().frustrationPeak, MAX);

  GameState.addFrustration(5, 'schon voll');
  assert.equal(events.of(EVENTS.FRUSTRATION_CHANGED).length, 2, 'keine Änderung → kein Event');
  GameState.addFrustration(NaN, 'kaputt');
  assert.equal(GameState.getFrustration(), MAX);
});

test('addFrustration: RAGE_QUIT genau einmal pro Lauf, nach dem Frust-Event', () => {
  GameState.startRun();
  const events = recordEvents();
  GameState.addFrustration(MAX, 'Heilandsack');
  assert.deepEqual(events.of(EVENTS.RAGE_QUIT), [{ reason: 'Heilandsack' }]);
  const frustIndex = events.log.findIndex((entry) => entry.event === EVENTS.FRUSTRATION_CHANGED);
  const rageIndex = events.log.findIndex((entry) => entry.event === EVENTS.RAGE_QUIT);
  assert.ok(frustIndex < rageIndex, 'HUD sieht erst 100 %, dann den Rage-Quit');

  GameState.addFrustration(10, 'noch mehr');
  GameState.reduceFrustration(50, 'Brezel');
  GameState.addFrustration(80, 'wieder voll');
  assert.equal(GameState.getFrustration(), MAX);
  assert.equal(events.of(EVENTS.RAGE_QUIT).length, 1, 'nur einmal pro Lauf');

  GameState.startRun();
  GameState.addFrustration(MAX, 'neuer Lauf');
  assert.equal(events.of(EVENTS.RAGE_QUIT).length, 2, 'im neuen Lauf wieder möglich');
});

test('RAGE_QUIT nur in einem laufenden Lauf', () => {
  GameState.startRun();
  GameState.abortRun();
  const events = recordEvents();
  GameState.addFrustration(MAX, 'nach Abbruch');
  assert.equal(events.of(EVENTS.RAGE_QUIT).length, 0);
});

test('reduceFrustration: Clamp bei 0, negatives delta, Spitzenwert bleibt', () => {
  GameState.startRun();
  GameState.addFrustration(10, 'Fehler');
  const events = recordEvents();
  assert.equal(GameState.reduceFrustration(4, 'Brezel'), 6);
  assert.deepEqual(events.of(EVENTS.FRUSTRATION_CHANGED), [{ value: 6, delta: -4, reason: 'Brezel' }]);
  GameState.reduceFrustration(50, 'Kaffee');
  assert.equal(GameState.getFrustration(), 0);
  assert.equal(events.of(EVENTS.FRUSTRATION_CHANGED)[1].delta, -6);
  GameState.reduceFrustration(5, 'schon leer');
  assert.equal(events.of(EVENTS.FRUSTRATION_CHANGED).length, 2);
  assert.equal(GameState.getSnapshot().frustrationPeak, 10);
});

test('Zusatz: setFrustration setzt einen absoluten Wert (Debug-API)', () => {
  GameState.startRun();
  const events = recordEvents();
  GameState.setFrustration(55);
  assert.equal(GameState.getFrustration(), 55);
  GameState.setFrustration(20);
  assert.equal(GameState.getFrustration(), 20);
  assert.deepEqual(
    events.of(EVENTS.FRUSTRATION_CHANGED).map((p) => p.delta),
    [55, -35]
  );
});

test('recordFail / recordSuccess zählen pro Kapitel und insgesamt', () => {
  GameState.startRun(2);
  const events = recordEvents();
  GameState.recordFail(2, 'falsche EAP-Methode');
  GameState.recordFail(2, 'Domain fehlt');
  GameState.recordFail(3, 'Funkloch');
  GameState.recordSuccess(2);
  const snapshot = GameState.getSnapshot();
  assert.deepEqual(snapshot.attempts[2], { fails: 2, successes: 1 });
  assert.deepEqual(snapshot.attempts[3], { fails: 1, successes: 0 });
  assert.equal(snapshot.totalFails, 3);
  assert.equal(GameState.getTotalFails(), 3);
  assert.ok(events.of(EVENTS.STATE_CHANGED).length >= 4, 'jede Schreibmethode sendet STATE_CHANGED');
  GameState.recordFail(undefined, 'ohne Kapitel');
  assert.equal(GameState.getSnapshot().attempts[2].fails, 3, 'ohne ID: aktuelles Kapitel');
  assert.equal(GameState.getSnapshot().totalFails, 4);
});

test('completeChapter speichert stats (als Kopie) und sendet CHAPTER_COMPLETE', () => {
  GameState.startRun();
  const events = recordEvents();
  const stats = { fails: 2, minutesSpent: 12, extra: { captchaTries: 3 } };
  GameState.completeChapter(1, stats);
  assert.deepEqual(events.of(EVENTS.CHAPTER_COMPLETE), [
    { chapterId: 1, stats: { fails: 2, minutesSpent: 12, extra: { captchaTries: 3 } } },
  ]);
  stats.fails = 99;
  stats.extra.captchaTries = 99;
  assert.deepEqual(GameState.getSnapshot().chapterStats[1], { fails: 2, minutesSpent: 12, extra: { captchaTries: 3 } });
  GameState.completeChapter(2);
  assert.deepEqual(GameState.getSnapshot().chapterStats[2], {});
  assert.equal(events.of(EVENTS.CHAPTER_COMPLETE).length, 2);
  assert.ok(events.of(EVENTS.STATE_CHANGED).length >= 2);
});

test('completeChapter/setFlag verkraften zyklische Daten ohne Absturz', () => {
  GameState.startRun();
  const cyclic = { name: 'Szene', list: [1, 2] };
  cyclic.self = cyclic;
  cyclic.list.push(cyclic);
  assert.doesNotThrow(() => GameState.completeChapter(3, { fails: 0, scene: cyclic }));
  assert.doesNotThrow(() => GameState.setFlag('zyklisch', cyclic));
  const stored = GameState.getSnapshot().chapterStats[3].scene;
  assert.equal(stored.name, 'Szene');
  assert.equal(stored.self, stored, 'Zyklus bleibt als Zyklus in der Kopie erhalten');
  assert.notEqual(stored, cyclic, 'aber nicht das Originalobjekt');
  assert.deepEqual(stored.list.slice(0, 2), [1, 2]);
  assert.doesNotThrow(() => GameState.finishRun(true));
});

test('unlockAchievement: einmal pro Lauf, Storage.addAchievement, ACHIEVEMENT mit isNewGlobal', () => {
  GameState.startRun();
  const events = recordEvents();
  const def = CONFIG.ACHIEVEMENTS.TOS_READER;
  assert.equal(GameState.unlockAchievement('TOS_READER'), true);
  assert.deepEqual(events.of(EVENTS.ACHIEVEMENT), [
    { id: def.id, title: def.title, description: def.description, isNewGlobal: true },
  ]);
  assert.equal(GameState.unlockAchievement('TOS_READER'), false);
  assert.equal(events.of(EVENTS.ACHIEVEMENT).length, 1, 'nur einmal pro Lauf');
  assert.deepEqual(GameState.getSnapshot().runAchievements, ['TOS_READER']);
  assert.ok(Storage.getAchievements().includes('TOS_READER'));

  GameState.startRun();
  assert.deepEqual(GameState.getSnapshot().runAchievements, []);
  assert.equal(GameState.unlockAchievement('TOS_READER'), true, 'neuer Lauf: wieder freischaltbar');
  assert.equal(events.of(EVENTS.ACHIEVEMENT)[1].isNewGlobal, false, 'global schon bekannt');

  const errors = captureErrors(() => {
    assert.equal(GameState.unlockAchievement('GIBT_ES_NICHT'), false);
    assert.equal(GameState.unlockAchievement('constructor'), false, 'kein Zugriff über den Prototyp');
  });
  assert.equal(errors.length, 2, 'Tippfehler in Erfolgs-IDs müssen als Fehler auffallen');
  assert.ok(errors[0].includes('GIBT_ES_NICHT'));
  assert.equal(events.of(EVENTS.ACHIEVEMENT).length, 2);
  assert.ok(!Storage.getAchievements().includes('GIBT_ES_NICHT'));
});

test('getCredentials: Fallback ohne setCredentials (CAMPUS.defaultPassword, isDefault true)', () => {
  GameState.startRun();
  assert.deepEqual(GameState.getCredentials(), {
    username: CAMPUS.username,
    identity: CAMPUS.identity,
    password: CAMPUS.defaultPassword,
    isDefault: true,
  });
});

test('setCredentials: eigenes Passwort; Passwort nie im Snapshot oder im localStorage', () => {
  GameState.startRun();
  const events = recordEvents();
  const password = 'Spätzle#2026-WWI26A';
  GameState.setCredentials({ username: CAMPUS.username, password });
  assert.deepEqual(GameState.getCredentials(), {
    username: CAMPUS.username,
    identity: CAMPUS.identity,
    password,
    isDefault: false,
  });
  assert.ok(events.of(EVENTS.STATE_CHANGED).length >= 1);
  assert.ok(!JSON.stringify(GameState.getSnapshot()).includes(password), 'nicht im Snapshot');
  assert.ok(!JSON.stringify(events.log).includes(password), 'nicht in Event-Payloads');
  GameState.finishRun(true);
  for (let i = 0; i < globalThis.localStorage.length; i++) {
    const key = globalThis.localStorage.key(i);
    assert.ok(!String(globalThis.localStorage.getItem(key)).includes(password), `nicht in localStorage (${key})`);
  }
});

test('setCredentials: Kennung mit Realm, Teil-Updates, leere Werte', () => {
  GameState.startRun();
  GameState.setCredentials({ username: 'wwi26042@lehre.dhbw-stuttgart.de', password: 'abc' });
  assert.equal(GameState.getCredentials().identity, 'wwi26042@lehre.dhbw-stuttgart.de');
  GameState.startRun();
  GameState.setCredentials({ password: 'NurPasswort1!' });
  assert.equal(GameState.getCredentials().username, CAMPUS.username);
  assert.equal(GameState.getCredentials().password, 'NurPasswort1!');
  GameState.setCredentials({ password: '' });
  assert.equal(GameState.getCredentials().password, 'NurPasswort1!', 'leeres Passwort ignorieren');
  GameState.startRun();
  GameState.setCredentials({});
  assert.equal(GameState.getCredentials().isDefault, true);
});

test('setFlag / getFlag: Fallback, Snapshot, Kopie, Reset bei startRun', () => {
  GameState.startRun();
  assert.equal(GameState.getFlag('phished', false), false);
  assert.equal(GameState.getFlag('unbekannt'), undefined);
  const events = recordEvents();
  GameState.setFlag('phished', true);
  assert.equal(GameState.getFlag('phished', false), true);
  assert.equal(GameState.getSnapshot().flags.phished, true);
  assert.equal(events.of(EVENTS.STATE_CHANGED).length, 1);
  const data = { tries: 1 };
  GameState.setFlag('ch3', data);
  data.tries = 5;
  assert.deepEqual(GameState.getFlag('ch3'), { tries: 1 }, 'beim Setzen kopiert');
  GameState.getFlag('ch3').tries = 9;
  assert.deepEqual(GameState.getFlag('ch3'), { tries: 1 }, 'beim Lesen kopiert');
  GameState.startRun();
  assert.equal(GameState.getFlag('phished', false), false);
});

test('setObjective sendet OBJECTIVE_CHANGED { text } und STATE_CHANGED', () => {
  GameState.startRun();
  const events = recordEvents();
  GameState.setObjective('Melde dich im Self-Service-Portal an.');
  assert.deepEqual(events.of(EVENTS.OBJECTIVE_CHANGED), [{ text: 'Melde dich im Self-Service-Portal an.' }]);
  const states = events.of(EVENTS.STATE_CHANGED);
  assert.equal(states[states.length - 1].objective, 'Melde dich im Self-Service-Portal an.');
  assert.equal(GameState.getSnapshot().objective, 'Melde dich im Self-Service-Portal an.');
  GameState.setObjective('Melde dich im Self-Service-Portal an.');
  assert.equal(events.of(EVENTS.OBJECTIVE_CHANGED).length, 1, 'gleicher Text: kein erneutes Event');
  GameState.setObjective('Löse das CAPTCHA.');
  assert.equal(events.of(EVENTS.OBJECTIVE_CHANGED).length, 2);
});

test('setPaused sendet PAUSE_CHANGED { paused } nur bei Änderung', () => {
  GameState.startRun();
  const events = recordEvents();
  GameState.setPaused(true);
  assert.equal(GameState.isPaused(), true);
  assert.equal(GameState.getSnapshot().paused, true);
  GameState.setPaused(true);
  GameState.setPaused(false);
  assert.deepEqual(events.of(EVENTS.PAUSE_CHANGED), [{ paused: true }, { paused: false }]);
  assert.equal(GameState.isPaused(), false);
});

test('Zusatz: setPaused(bool, reason) gibt den Grund im Payload mit', () => {
  GameState.startRun();
  const events = recordEvents();
  GameState.setPaused(true, 'intro');
  GameState.setPaused(false, 'intro');
  assert.deepEqual(events.of(EVENTS.PAUSE_CHANGED), [
    { paused: true, reason: 'intro' },
    { paused: false, reason: 'intro' },
  ]);
});

test('Zusatz: getClockLabel({ withDay: false }) lässt den Tag weg', () => {
  GameState.startRun();
  GameState.advanceClock(24 * 60 + 1, '24 h warten');
  assert.equal(GameState.getClockLabel(), Scoring.formatClock(START + 24 * 60 + 1));
  assert.ok(GameState.getClockLabel().startsWith('Tag 2, '));
  assert.equal(GameState.getClockLabel({ withDay: false }), Scoring.formatClock(START + 1));
});

test('setCurrentChapter setzt das aktuelle Kapitel und sendet STATE_CHANGED', () => {
  GameState.startRun(1);
  const events = recordEvents();
  GameState.setCurrentChapter(4);
  assert.equal(GameState.getSnapshot().currentChapterId, 4);
  assert.equal(events.of(EVENTS.STATE_CHANGED).length, 1);
  const errors = captureErrors(() => GameState.setCurrentChapter(42));
  assert.equal(errors.length, 1, 'ungültige Kapitel-ID muss als Fehler auffallen');
  assert.equal(GameState.getSnapshot().currentChapterId, 4, 'ungültige ID ignorieren');
});

test('isPastLecture: ab Vorlesungsbeginn true', () => {
  GameState.startRun();
  assert.equal(GameState.isPastLecture(), false);
  GameState.advanceClock(LECTURE - START - 1, 'warten');
  assert.equal(GameState.isPastLecture(), false);
  GameState.advanceClock(1, 'warten');
  assert.equal(GameState.isPastLecture(), true);
});

test('getSnapshot ist eine tiefe Kopie; STATE_CHANGED-Payload ebenso', () => {
  GameState.startRun();
  GameState.recordFail(1, 'x');
  GameState.completeChapter(1, { fails: 1, nested: { a: 1 } });
  GameState.unlockAchievement('CAPTCHA_HUMAN');
  GameState.setFlag('liste', [1, 2]);
  const snapshot = GameState.getSnapshot();
  snapshot.attempts[1].fails = 99;
  snapshot.chapterStats[1].nested.a = 99;
  snapshot.runAchievements.push('HACK');
  snapshot.flags.liste.push(3);
  snapshot.flags.neu = true;
  snapshot.frustration = 99;
  const fresh = GameState.getSnapshot();
  assert.equal(fresh.attempts[1].fails, 1);
  assert.equal(fresh.chapterStats[1].nested.a, 1);
  assert.deepEqual(fresh.runAchievements, ['CAPTCHA_HUMAN']);
  assert.deepEqual(fresh.flags, { liste: [1, 2] });
  assert.equal(fresh.frustration, 0);

  let payload = null;
  GameState.on(EVENTS.STATE_CHANGED, (state) => {
    payload = state;
  });
  GameState.recordFail(1, 'y');
  payload.attempts[1].fails = 1000;
  assert.equal(GameState.getSnapshot().attempts[1].fails, 2);
});

test('Methoden funktionieren auch ohne Objektbezug (z. B. als Callback)', () => {
  GameState.startRun();
  const { getClockLabel, addFrustration } = GameState;
  assert.equal(getClockLabel(), '07:30');
  addFrustration(3, 'losgelöst');
  assert.equal(GameState.getFrustration(), 3);
});

test('finishRun(true) pünktlich und gelassen: ON_TIME + ZEN_MASTER, Score, Highscore, vollständiges Ergebnis', () => {
  GameState.startRun();
  GameState.recordFail(1, 'Initialpasswort vertippt');
  GameState.unlockAchievement('CAPTCHA_HUMAN');
  GameState.completeChapter(1, { fails: 1, minutesSpent: 20 });
  GameState.advanceClock(20, 'Ladezeit');
  GameState.addFrustration(10, 'EDGE');
  const events = recordEvents();

  const result = GameState.finishRun(true);
  const expectedKeys = [
    'won', 'reason', 'score', 'rank', 'isNewHighscore', 'highscore', 'clockMinutes', 'clockLabel',
    'minutesLate', 'totalFails', 'frustration', 'frustrationPeak', 'runAchievements', 'chapterStats',
  ];
  for (const key of expectedKeys) assert.ok(key in result, `Ergebnis ohne „${key}“`);

  assert.equal(result.won, true);
  assert.equal(result.reason, null);
  assert.equal(GameState.getSnapshot().status, 'won');
  assert.deepEqual(
    result.runAchievements.map((a) => a.id),
    ['CAPTCHA_HUMAN', 'ON_TIME', 'ZEN_MASTER']
  );
  for (const achievement of result.runAchievements) {
    const def = CONFIG.ACHIEVEMENTS[achievement.id];
    assert.equal(achievement.title, def.title);
    assert.equal(achievement.description, def.description);
  }
  const expectedScore = Scoring.computeScore({
    clockMinutes: START + 20,
    totalFails: 1,
    frustrationPeak: 10,
    achievementCount: 3,
    won: true,
  });
  assert.equal(result.score, expectedScore);
  assert.equal(result.rank, Scoring.rankTitle(expectedScore));
  assert.equal(result.clockMinutes, START + 20);
  assert.equal(result.clockLabel, Scoring.formatClock(START + 20));
  assert.equal(result.minutesLate, 0);
  assert.equal(result.totalFails, 1);
  assert.equal(result.frustration, 10);
  assert.equal(result.frustrationPeak, 10);
  assert.deepEqual(result.chapterStats, { 1: { fails: 1, minutesSpent: 20 } });

  assert.equal(result.isNewHighscore, true);
  assert.equal(result.highscore.score, expectedScore);
  assert.equal(result.highscore.rank, result.rank);
  assert.equal(result.highscore.clockLabel, result.clockLabel);
  assert.equal(result.highscore.won, true);
  assert.deepEqual(Storage.getHighscore(), result.highscore);

  assert.ok(Storage.getAchievements().includes('ON_TIME'));
  assert.ok(Storage.getAchievements().includes('ZEN_MASTER'));
  assert.deepEqual(
    events.of(EVENTS.ACHIEVEMENT).map((p) => p.id),
    ['ON_TIME', 'ZEN_MASTER']
  );
  const states = events.of(EVENTS.STATE_CHANGED);
  assert.equal(states[states.length - 1].status, 'won');

  result.chapterStats[1].fails = 77;
  assert.equal(GameState.getSnapshot().chapterStats[1].fails, 1, 'Ergebnis ist eine Kopie');
});

test('finishRun(true) zu spät und frustriert: keine globalen Erfolge, minutesLate', () => {
  GameState.startRun();
  GameState.addFrustration(45, 'Merkblatt von 2014');
  GameState.advanceClock(LECTURE - START + 10, 'Synchronisation');
  const result = GameState.finishRun(true);
  assert.deepEqual(result.runAchievements, []);
  assert.equal(result.minutesLate, 10);
  assert.ok(result.frustrationPeak >= 45);
  assert.equal(
    result.score,
    Scoring.computeScore({
      clockMinutes: LECTURE + 10,
      totalFails: 0,
      frustrationPeak: result.frustrationPeak,
      achievementCount: 0,
      won: true,
    })
  );
});

test('finishRun: ON_TIME nur strikt vor Vorlesungsbeginn', () => {
  const idsAfter = (minutes) => {
    GameState.startRun();
    GameState.advanceClock(minutes, 'warten');
    return GameState.finishRun(true).runAchievements.map((a) => a.id);
  };
  assert.ok(idsAfter(LECTURE - START - 1).includes('ON_TIME'), 'eine Minute vorher ist pünktlich');
  assert.ok(!idsAfter(LECTURE - START).includes('ON_TIME'), 'genau zum Vorlesungsbeginn ist zu spät');
});

test('finishRun: ZEN_MASTER nur mit Frust-Spitzenwert unter 40 %', () => {
  const idsWithPeak = (peak) => {
    GameState.startRun();
    GameState.setFrustration(peak);
    GameState.setFrustration(0);
    return GameState.finishRun(true).runAchievements.map((a) => a.id);
  };
  assert.ok(idsWithPeak(39).includes('ZEN_MASTER'), '39 % reicht');
  assert.ok(!idsWithPeak(40).includes('ZEN_MASTER'), '40 % ist nicht unter 40 % (Spitzenwert zählt)');
});

test('finishRun(false, "rage"): RAGE_QUIT-Erfolg, Verlustfaktor, alter Highscore bleibt', () => {
  GameState.startRun();
  const good = GameState.finishRun(true);
  assert.equal(good.isNewHighscore, true);

  GameState.startRun();
  const events = recordEvents();
  GameState.recordFail(4, 'Evil Twin');
  GameState.addFrustration(MAX, 'Heilandsack');
  assert.equal(events.of(EVENTS.RAGE_QUIT).length, 1);
  const result = GameState.finishRun(false, 'rage');
  assert.equal(result.won, false);
  assert.equal(result.reason, 'rage');
  assert.equal(GameState.getSnapshot().status, 'lost');
  assert.deepEqual(result.runAchievements.map((a) => a.id), ['RAGE_QUIT']);
  assert.equal(
    result.score,
    Scoring.computeScore({ clockMinutes: START, totalFails: 1, frustrationPeak: MAX, achievementCount: 1, won: false })
  );
  assert.equal(result.isNewHighscore, false);
  assert.equal(result.highscore.score, good.score);
  assert.equal(result.frustration, MAX);
});

test('finishRun(false) ohne rage: kein RAGE_QUIT-Erfolg', () => {
  GameState.startRun();
  const result = GameState.finishRun(false, 'timeout');
  assert.deepEqual(result.runAchievements, []);
  assert.equal(result.reason, 'timeout');
});

test('finishRun ist idempotent: zweiter Aufruf liefert dasselbe Ergebnis ohne neue Events', () => {
  GameState.startRun();
  const events = recordEvents();
  const first = GameState.finishRun(true);
  const count = events.log.length;
  const second = GameState.finishRun(false, 'rage');
  assert.deepEqual(second, first);
  assert.equal(events.log.length, count, 'keine weiteren Events');
});

test('abortRun setzt status aborted und sendet STATE_CHANGED', () => {
  GameState.startRun();
  GameState.setPaused(true);
  const events = recordEvents();
  GameState.abortRun();
  assert.equal(GameState.getSnapshot().status, 'aborted');
  assert.equal(GameState.isPaused(), false);
  const states = events.of(EVENTS.STATE_CHANGED);
  assert.equal(states[states.length - 1].status, 'aborted');
});
