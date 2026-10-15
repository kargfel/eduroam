/**
 * ch3.test.js – Unit-Tests für Kapitel 3 „Die Signaljagd“ (src/logic/ch3SignalHunt.js).
 *
 * Prüft: Geometrie-/Kollisionshilfen, Level-Daten (Erreichbarkeit, keine versteckten
 * Funklöcher, genug Brezeln außerhalb der Funklöcher), Signal- und Bandbreitenmodell,
 * Formatierung (deutsche Zahlen), die Simulation (Bewegung, Funkloch mit Gnadenfrist,
 * Neuverbindung, Pickups, Wartungsfenster, 99-%-Hänger, Countdown, Gnaden-Abschluss)
 * sowie die Balance über simulierte Laufwege (perfekte und sichere Route).
 *
 * Zufall: Die Tests injizieren einen eigenen, seedbaren Generator (TestRng), damit sie
 * auch ohne fertiges src/core/rng.js laufen. Ist RNG geladen, wird zusätzlich geprüft,
 * dass createSim() ohne Parameter den globalen RNG nutzt.
 *
 * Aufruf: node --test "tests/unit/ch3.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, CORE_LOGIC_FILES } = require('./_load.js');

const { Ch3Logic, CONFIG, CAMPUS } = loadScripts(
  [...CORE_LOGIC_FILES, 'src/logic/ch3SignalHunt.js'],
  ['Ch3Logic', 'CONFIG', 'CAMPUS']
);

const LEVEL = Ch3Logic.LEVEL;
const BALANCE = Ch3Logic.BALANCE;
const FRAME_MS = 1000 / 60;

/** Kleiner seedbarer Zufallsgenerator mit der RNG-Schnittstelle aus dem Vertrag (Mulberry32). */
function createTestRng(seed = 7) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (array) => (array && array.length ? array[Math.floor(next() * array.length)] : undefined),
    shuffle: (array) => [...(array || [])].sort(() => next() - 0.5),
    getSeed: () => seed,
  };
}

/** Neue Simulation mit Test-Zufall. */
function newSim(seed = 7) {
  return Ch3Logic.createSim({ rng: createTestRng(seed) });
}

/** Lässt die Simulation `seconds` lang mit fester Eingabe laufen; sammelt Ereignisse. */
function run(sim, seconds, input = { dx: 0, dy: 0 }) {
  const events = [];
  const frames = Math.round((seconds * 1000) / FRAME_MS);
  for (let i = 0; i < frames; i++) events.push(...Ch3Logic.stepSim(sim, FRAME_MS, input));
  return events;
}

/**
 * Steuert die Spielfigur wie mit Pfeiltasten zu einem Zielpunkt (achsenweise, mit Toleranz).
 * Wirft, wenn das Ziel nicht in `maxSeconds` erreicht wird.
 */
function steerTo(sim, target, { maxSeconds = 25, tolerance = 4 } = {}) {
  const events = [];
  const maxFrames = Math.round((maxSeconds * 1000) / FRAME_MS);
  for (let i = 0; i < maxFrames; i++) {
    const p = sim.player;
    const offX = target.x - p.x;
    const offY = target.y - p.y;
    if (Math.abs(offX) <= tolerance && Math.abs(offY) <= tolerance) return events;
    const input = {
      dx: Math.abs(offX) > tolerance ? Math.sign(offX) : 0,
      dy: Math.abs(offY) > tolerance ? Math.sign(offY) : 0,
    };
    events.push(...Ch3Logic.stepSim(sim, FRAME_MS, input));
    if (sim.phase === 'done') return events;
  }
  throw new Error(`Ziel (${target.x}|${target.y}) nicht erreicht, Figur bei (${Math.round(sim.player.x)}|${Math.round(sim.player.y)})`);
}

/** Folgt einer Liste von Wegpunkten. */
function followRoute(sim, route, opts) {
  const events = [];
  for (const point of route) {
    events.push(...steerTo(sim, point, opts));
    if (sim.phase === 'done') break;
  }
  return events;
}

/** Wartet (ohne Eingabe), bis die Simulation fertig ist oder `maxSeconds` vergangen sind. */
function waitUntilDone(sim, maxSeconds = 300) {
  const events = [];
  const maxFrames = Math.round((maxSeconds * 1000) / FRAME_MS);
  for (let i = 0; i < maxFrames && sim.phase !== 'done'; i++) {
    events.push(...Ch3Logic.stepSim(sim, FRAME_MS, { dx: 0, dy: 0 }));
  }
  return events;
}

/** Läuft, bis ein Ereignis des Typs `type` auftritt (inklusive), höchstens `maxSeconds`. */
function runUntil(sim, type, maxSeconds = 10, input = { dx: 0, dy: 0 }) {
  const events = [];
  const maxFrames = Math.round((maxSeconds * 1000) / FRAME_MS);
  for (let i = 0; i < maxFrames; i++) {
    const step = Ch3Logic.stepSim(sim, FRAME_MS, input);
    events.push(...step);
    if (step.some((e) => e.type === type)) break;
  }
  return events;
}

const types = (events) => events.map((e) => e.type);
const count = (events, type) => events.filter((e) => e.type === type).length;

/** Kürzeste Route: durchs Treppenhaus (Funkloch-Sprint) in die Bibliothek. */
const SHORT_ROUTE = [
  { x: 220, y: 248 },
  { x: 385, y: 248 },
  { x: 385, y: 110 },
  { x: LEVEL.bestSpot.x, y: LEVEL.bestSpot.y },
];

/** Sichere Route: über Mensa und Innenhof, ohne ein einziges Funkloch. */
const SAFE_ROUTE = [
  { x: 220, y: 248 },
  { x: 65, y: 248 },
  { x: 65, y: 330 },
  { x: 65, y: 425 },
  { x: 300, y: 425 },
  { x: 300, y: 328 },
  { x: 545, y: 328 },
  { x: 545, y: 262 },
  { x: 385, y: 262 },
  { x: 385, y: 110 },
  { x: LEVEL.bestSpot.x, y: LEVEL.bestSpot.y },
];

// ---------------------------------------------------------------------------
// Grundgerüst
// ---------------------------------------------------------------------------

test('Ch3Logic ist definiert, LEVEL/BALANCE/TEXTS sind eingefroren', () => {
  assert.equal(typeof Ch3Logic, 'object');
  for (const key of ['LEVEL', 'BALANCE', 'TEXTS']) {
    assert.ok(Ch3Logic[key], `${key} fehlt`);
    assert.ok(Object.isFrozen(Ch3Logic[key]), `${key} muss eingefroren sein`);
  }
  assert.ok(Object.isFrozen(LEVEL.aps) && Object.isFrozen(LEVEL.aps[0]), 'APs tief eingefroren');
  for (const fn of ['createSim', 'startSim', 'stepSim', 'solveSim', 'getSnapshot', 'evaluateSignal',
    'moveCircle', 'downloadRate', 'formatEta', 'formatCountdown']) {
    assert.equal(typeof Ch3Logic[fn], 'function', `${fn}() fehlt`);
  }
});

test('Kapitel-Daten kommen aus CAMPUS (Raum, Kurs, SSID) statt hart codiert', () => {
  const hall = LEVEL.rooms.find((room) => room.id === 'hoersaal');
  assert.ok(hall.label.includes(CAMPUS.lectureRoom.toUpperCase()), 'Hörsaal-Label nennt CAMPUS.lectureRoom');
  const parallelCourse = CAMPUS.course.slice(0, -1) + 'B';
  assert.ok(LEVEL.crowds.some((crowd) => crowd.label.includes(parallelCourse)), 'Parallelkurs aus CAMPUS.course');
  assert.equal(Ch3Logic.TEXTS.SSID, CAMPUS.wifi.ssid);
});

test('HUD-Aufgaben passen in die HUD (höchstens 45 Zeichen), jeder Anlauf hat einen Text', () => {
  const objectives = Object.values(Ch3Logic.TEXTS.OBJECTIVES).flat();
  for (const text of objectives) {
    assert.ok(text.length > 0 && text.length <= 45, `„${text}“ hat ${text.length} Zeichen`);
  }
  // Fristen 1 … MAX_EXPIRIES − 1 brauchen je eine Aufgabe; beim letzten Ablauf rettet der USB-Stick
  assert.ok(Ch3Logic.TEXTS.OBJECTIVES.RETRY.length >= BALANCE.MAX_EXPIRIES - 1);
});

// ---------------------------------------------------------------------------
// Geometrie und Kollision
// ---------------------------------------------------------------------------

test('pointInRect und circleIntersectsRect', () => {
  const r = { x: 10, y: 10, w: 20, h: 10 };
  assert.equal(Ch3Logic.pointInRect(15, 15, r), true);
  assert.equal(Ch3Logic.pointInRect(30, 15, r), false, 'rechter Rand exklusiv');
  assert.equal(Ch3Logic.pointInRect(5, 15, r), false);
  assert.equal(Ch3Logic.circleIntersectsRect(5, 15, 6, r), true, 'Kreis ragt hinein');
  assert.equal(Ch3Logic.circleIntersectsRect(5, 15, 5, r), false, 'Berührung zählt nicht');
  assert.equal(Ch3Logic.circleIntersectsRect(34, 24, 5, r), false, 'Ecke knapp verfehlt');
  assert.equal(Ch3Logic.circleIntersectsRect(33, 23, 5, r), true, 'Ecke getroffen');
});

test('segmentIntersectsRect erkennt Schnitt, Vorbeiflug und Endpunkte im Rechteck', () => {
  const wall = { x: 50, y: 0, w: 8, h: 100 };
  assert.equal(Ch3Logic.segmentIntersectsRect(0, 50, 100, 50, wall), true);
  assert.equal(Ch3Logic.segmentIntersectsRect(0, 150, 100, 150, wall), false);
  assert.equal(Ch3Logic.segmentIntersectsRect(0, 50, 40, 50, wall), false, 'endet vor der Wand');
  assert.equal(Ch3Logic.segmentIntersectsRect(54, 50, 100, 50, wall), true, 'beginnt in der Wand');
  assert.equal(Ch3Logic.segmentIntersectsRect(54, -10, 54, 110, wall), true, 'parallel innerhalb');
  assert.equal(Ch3Logic.segmentIntersectsRect(70, -10, 70, 110, wall), false, 'parallel außerhalb');
});

test('moveCircle: freie Bewegung, Wände stoppen, kein Tunneln, Gleiten an der Wand', () => {
  const wall = { x: 50, y: 0, w: 8, h: 100 };
  const free = Ch3Logic.moveCircle(0, 50, 20, 5, 5, []);
  assert.deepEqual([free.x, free.y, free.hitX, free.hitY], [20, 55, false, false]);

  const blocked = Ch3Logic.moveCircle(30, 50, 40, 0, 5, [wall]);
  assert.equal(blocked.hitX, true);
  assert.ok(blocked.x <= 45 && blocked.x >= 42, `stoppt vor der Wand, x=${blocked.x}`);
  assert.equal(blocked.hitSolid, wall);

  const fast = Ch3Logic.moveCircle(30, 50, 500, 0, 5, [wall]);
  assert.ok(fast.x < 50, 'großer Schritt tunnelt nicht durch die Wand');

  const slide = Ch3Logic.moveCircle(40, 50, 20, 20, 5, [wall]);
  assert.equal(slide.hitX, true);
  assert.equal(slide.hitY, false);
  assert.ok(Math.abs(slide.y - 70) < 0.001, 'gleitet in y weiter');
});

test('moveCircle mit Ecken-Hilfe: knapp verfehlte Türrahmen werden umschifft', () => {
  // Türrahmen-Stummel wie am Treppenhaus: Kreis kommt 3 px zu hoch an
  const stub = { x: 50, y: 0, w: 8, h: 20 };
  const radius = 5;
  const withoutAssist = Ch3Logic.moveCircle(30, 22, 40, 0, radius, [stub], 2, 0);
  assert.equal(withoutAssist.hitX, true, 'ohne Hilfe bleibt man hängen');
  const withAssist = Ch3Logic.moveCircle(30, 22, 40, 0, radius, [stub], 2, 6);
  assert.equal(withAssist.hitX, false, 'mit Hilfe gleitet man vorbei');
  assert.ok(withAssist.x > 60, `weitergekommen: x=${withAssist.x}`);
  assert.ok(withAssist.y >= 25 && withAssist.y <= 28, `nur wenige Pixel ausgewichen: y=${withAssist.y}`);
  // Frontal gegen eine lange Wand hilft die Ecken-Hilfe nicht (kein Durchrutschen)
  const wall = { x: 50, y: 0, w: 8, h: 100 };
  const frontal = Ch3Logic.moveCircle(30, 50, 40, 0, radius, [wall], 2, 6);
  assert.equal(frontal.hitX, true);
  assert.equal(frontal.y, 50, 'keine Querverschiebung an langer Wand');
});

test('diagonalSegments liefert Schraffur-Linien innerhalb des Rechtecks', () => {
  const r = { x: 100, y: 200, w: 60, h: 40 };
  const segments = Ch3Logic.diagonalSegments(r, 10);
  assert.ok(segments.length >= 8, `zu wenige Linien: ${segments.length}`);
  for (const s of segments) {
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      assert.ok(x >= r.x - 0.01 && x <= r.x + r.w + 0.01 && y >= r.y - 0.01 && y <= r.y + r.h + 0.01,
        `Punkt (${x}|${y}) außerhalb`);
    }
  }
});

// ---------------------------------------------------------------------------
// Level-Daten
// ---------------------------------------------------------------------------

/** Freie Rasterpunkte (Kreis der Spielfigur kollidiert nicht) und Erreichbarkeit per Breitensuche. */
function buildReachability(step = 6) {
  const radius = BALANCE.PLAYER_RADIUS;
  const { x: mx, y: my, width, height } = LEVEL.map;
  const cols = Math.floor(width / step);
  const rows = Math.floor(height / step);
  const free = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = mx + col * step + step / 2;
      const y = my + row * step + step / 2;
      free.push(!LEVEL.solids.some((s) => Ch3Logic.circleIntersectsRect(x, y, radius, s)));
    }
  }
  const index = (col, row) => row * cols + col;
  const toCell = (x, y) => [Math.floor((x - mx) / step), Math.floor((y - my) / step)];
  const reached = new Array(cols * rows).fill(false);
  const [sc, sr] = toCell(LEVEL.start.x, LEVEL.start.y);
  const queue = [[sc, sr]];
  reached[index(sc, sr)] = true;
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const i = index(nc, nr);
      if (!reached[i] && free[i]) {
        reached[i] = true;
        queue.push([nc, nr]);
      }
    }
  }
  const points = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (reached[index(col, row)]) points.push({ x: mx + col * step + step / 2, y: my + row * step + step / 2 });
    }
  }
  const isReachable = (x, y) => points.some((p) => Math.hypot(p.x - x, p.y - y) <= step);
  return { points, isReachable };
}

const REACH = buildReachability();

test('Start liegt frei im Hörsaal, außerhalb von Funklöchern und Menschentrauben', () => {
  const { x, y } = LEVEL.start;
  assert.ok(!LEVEL.solids.some((s) => Ch3Logic.circleIntersectsRect(x, y, BALANCE.PLAYER_RADIUS, s)));
  assert.equal(Ch3Logic.findDeadzone(x, y, LEVEL), null);
  assert.equal(Ch3Logic.findRoom(x, y, LEVEL).id, 'hoersaal');
  const sim = newSim();
  assert.equal(Ch3Logic.crowdAt(sim, x, y), null);
});

test('Funklöcher: Treppenhaus, Aufzug, Tiefenhörsaal; S21-Baustelle ist gesperrt', () => {
  const deadzones = LEVEL.rooms.filter((room) => room.isDeadzone).map((room) => room.id).sort();
  assert.deepEqual(deadzones, ['aufzug', 'tiefenhoersaal', 'treppenhaus']);
  const s21 = LEVEL.solids.find((s) => s.id === 's21');
  assert.ok(s21, 'S21-Baustelle muss ein Hindernis sein');
  const cx = s21.x + s21.w / 2;
  const cy = s21.y + s21.h / 2;
  assert.ok(!REACH.isReachable(cx, cy), 'Baustellenmitte ist unerreichbar');
});

test('alle Pickups und der beste Platz sind erreichbar und liegen nicht in Hindernissen', () => {
  for (const pickup of LEVEL.pickups) {
    assert.ok(REACH.isReachable(pickup.x, pickup.y), `${pickup.id} unerreichbar`);
  }
  assert.ok(REACH.isReachable(LEVEL.bestSpot.x, LEVEL.bestSpot.y), 'bestSpot unerreichbar');
});

test('BREZEL_LOVER ist ohne Funkloch schaffbar (genug Brezeln außerhalb)', () => {
  const brezels = LEVEL.pickups.filter((p) => p.type === 'brezel');
  const safe = brezels.filter((p) => !Ch3Logic.findDeadzone(p.x, p.y, LEVEL));
  assert.ok(safe.length >= BALANCE.BREZEL_GOAL, `nur ${safe.length} sichere Brezeln`);
  assert.ok(brezels.length > safe.length, 'mindestens eine Brezel als Funkloch-Köder');
  assert.ok(LEVEL.pickups.some((p) => p.type === 'coffee'));
  assert.ok(LEVEL.pickups.some((p) => p.type === 'repeater'));
});

test('keine versteckten Funklöcher: überall außerhalb der markierten Zonen gibt es Empfang', () => {
  const holes = [];
  const holesDuringOutage = [];
  for (const p of REACH.points) {
    if (Ch3Logic.findDeadzone(p.x, p.y, LEVEL)) continue;
    const normal = Ch3Logic.evaluateSignal(p.x, p.y, { level: LEVEL, balance: BALANCE });
    if (normal.bestApId === null) holes.push(p);
    const outage = Ch3Logic.evaluateSignal(p.x, p.y, {
      level: LEVEL, balance: BALANCE, offlineIds: [BALANCE.OUTAGE.AP_ID],
    });
    if (outage.bestApId === null) holesDuringOutage.push(p);
  }
  assert.deepEqual(holes.slice(0, 5), [], `${holes.length} Punkte ohne Empfang`);
  assert.deepEqual(holesDuringOutage.slice(0, 5), [], `${holesDuringOutage.length} Punkte ohne Empfang im Wartungsfenster`);
});

// ---------------------------------------------------------------------------
// Signal und Bandbreite
// ---------------------------------------------------------------------------

test('Signal fällt mit der Entfernung und hinter Wänden; Funkloch = 0', () => {
  const ap = LEVEL.aps.find((a) => a.id === 'bib');
  const near = Ch3Logic.signalQuality(ap, ap.x - 20, ap.y + 20, LEVEL.walls, BALANCE);
  const far = Ch3Logic.signalQuality(ap, ap.x - 150, ap.y + 100, LEVEL.walls, BALANCE);
  assert.ok(near > far && far > 0, `nah ${near} > fern ${far} > 0`);
  assert.equal(Ch3Logic.signalQuality(ap, ap.x + ap.range + 1, ap.y, [], BALANCE), 0, 'außer Reichweite');

  const open = Ch3Logic.signalQuality(ap, ap.x - 100, ap.y, [], BALANCE);
  const behindWall = Ch3Logic.signalQuality(ap, ap.x - 100, ap.y, [{ x: ap.x - 50, y: ap.y - 20, w: 8, h: 40 }], BALANCE);
  assert.ok(Math.abs(behindWall - open * BALANCE.WALL_FACTOR) < 1e-9, 'eine Wand dämpft um WALL_FACTOR');

  const stairs = LEVEL.rooms.find((room) => room.id === 'treppenhaus');
  const inside = Ch3Logic.evaluateSignal(stairs.x + stairs.w / 2, stairs.y + stairs.h / 2, { level: LEVEL, balance: BALANCE });
  assert.equal(inside.deadzone, 'treppenhaus');
  assert.equal(inside.bestApId, null);
  assert.equal(inside.bestQuality, 0);
});

test('barsFor bildet Qualität auf 0–4 Balken ab', () => {
  const [one, two, three, four] = BALANCE.BAR_THRESHOLDS;
  assert.equal(Ch3Logic.barsFor(0), 0);
  assert.equal(Ch3Logic.barsFor(one - 0.001), 0);
  assert.equal(Ch3Logic.barsFor(one), 1);
  assert.equal(Ch3Logic.barsFor(two), 2);
  assert.equal(Ch3Logic.barsFor(three), 3);
  assert.equal(Ch3Logic.barsFor(four), 4);
  assert.equal(Ch3Logic.barsFor(1), 4);
});

test('Bandbreite wird geteilt: mehr Geräte = weniger Durchsatz', () => {
  const ap = LEVEL.aps[0];
  const alone = Ch3Logic.downloadRate(ap, 1, 0, BALANCE);
  const shared = Ch3Logic.downloadRate(ap, 1, BALANCE.SHARE_CLIENTS, BALANCE);
  assert.ok(Math.abs(alone - ap.maxRate) < 1e-9);
  assert.ok(Math.abs(shared - alone / 2) < 1e-9, 'SHARE_CLIENTS Geräte halbieren den Durchsatz');
  assert.equal(Ch3Logic.downloadRate(ap, 0, 0, BALANCE), 0);
});

test('Menschentrauben hängen am stärksten AP; die Erstis überlasten den Hörsaal-AP', () => {
  const sim = newSim();
  const loads = Ch3Logic.computeApLoads(sim.crowds, LEVEL, BALANCE, []);
  const erstis = LEVEL.crowds.find((c) => c.id === 'erstis');
  assert.ok(loads.hs >= erstis.clients, `Hörsaal-AP trägt die Erstis (${loads.hs})`);
});

test('Der Gag stimmt: Im Hörsaal volle Balken, aber Schneckentempo', () => {
  const sim = newSim();
  assert.equal(sim.connection.apId, 'hs');
  assert.equal(Ch3Logic.barsFor(sim.quality), 4, `volle Balken erwartet, Qualität ${sim.quality}`);
  assert.ok(sim.potentialRate > 0 && sim.potentialRate < BALANCE.SLOW_RATE, `Hörsaal-Rate ${sim.potentialRate}`);
  const etaSeconds = sim.sizeMB / sim.potentialRate;
  assert.ok(etaSeconds > 10 * 60, 'Restzeit im Hörsaal deutlich über 10 Minuten');
});

test('In der Bibliothek (bester Platz) ist der Durchsatz am höchsten', () => {
  const rateAt = (x, y) => {
    const signal = Ch3Logic.evaluateSignal(x, y, { level: LEVEL, balance: BALANCE });
    const ap = LEVEL.aps.find((a) => a.id === signal.bestApId);
    const staticLoads = Ch3Logic.computeApLoads(
      LEVEL.crowds.filter((c) => !c.speed).map((c) => ({ id: c.id, x: c.path[0].x, y: c.path[0].y })),
      LEVEL, BALANCE, []
    );
    return Ch3Logic.downloadRate(ap, signal.bestQuality, staticLoads[ap.id] || 0, BALANCE);
  };
  const best = rateAt(LEVEL.bestSpot.x, LEVEL.bestSpot.y);
  assert.ok(best >= 1.0, `bester Platz nur ${best} MB/s`);
  for (const p of [LEVEL.start, { x: 140, y: 400 }, { x: 470, y: 262 }, { x: 430, y: 520 }, { x: 300, y: 330 }]) {
    assert.ok(rateAt(p.x, p.y) < best, `(${p.x}|${p.y}) darf nicht schneller sein als die Bibliothek`);
  }
});

// ---------------------------------------------------------------------------
// Formatierung
// ---------------------------------------------------------------------------

test('Formatierung mit deutschem Dezimalkomma', () => {
  assert.equal(Ch3Logic.formatMB(23.44), '23,4 MB');
  assert.equal(Ch3Logic.formatMB(48), '48,0 MB');
  assert.equal(Ch3Logic.formatRate(1.26), '1,3 MB/s');
  assert.equal(Ch3Logic.formatRate(0.031), '31 kB/s');
  assert.equal(Ch3Logic.formatRate(0), '0 kB/s');
  assert.equal(Ch3Logic.formatSize(48), '48 MB', 'ganze Dateigröße ohne „,0“ (passt in die Karte)');
  assert.equal(Ch3Logic.formatSize(47.5), '47,5 MB');
});

test('formatDuration/formatEta: Sekunden, Minuten, Stunden, Tage, unbekannt', () => {
  assert.equal(Ch3Logic.formatDuration(31), '31 Sek.');
  assert.equal(Ch3Logic.formatDuration(0.2), '1 Sek.');
  assert.equal(Ch3Logic.formatDuration(26 * 60 - 10), '26 Min.');
  assert.equal(Ch3Logic.formatDuration(3 * 3600), '3 Std.');
  assert.equal(Ch3Logic.formatDuration(4 * 86400), '4 Tage');
  assert.equal(Ch3Logic.formatEta(31), 'Noch ca. 31 Sek.');
  assert.equal(Ch3Logic.formatEta(Infinity), 'Restzeit: unbekannt');
  assert.equal(Ch3Logic.formatEta(NaN), 'Restzeit: unbekannt');
});

test('formatCountdown rundet auf und zeigt m:ss', () => {
  assert.equal(Ch3Logic.formatCountdown(135), '2:15');
  assert.equal(Ch3Logic.formatCountdown(9.2), '0:10');
  assert.equal(Ch3Logic.formatCountdown(0), '0:00');
  assert.equal(Ch3Logic.formatCountdown(-5), '0:00');
});

// ---------------------------------------------------------------------------
// Simulation: Grundablauf
// ---------------------------------------------------------------------------

test('createSim ist mit gleichem Seed deterministisch und startet in Phase "ready"', () => {
  const a = newSim(42);
  const b = newSim(42);
  assert.equal(a.phase, 'ready');
  assert.equal(a.fileName, b.fileName);
  assert.equal(a.outage.at, b.outage.at);
  assert.ok(Ch3Logic.TEXTS.FILE_NAMES.includes(a.fileName));
  assert.ok(a.outage.at >= BALANCE.OUTAGE.AT_MIN && a.outage.at <= BALANCE.OUTAGE.AT_MAX);
  assert.equal(a.sizeMB, BALANCE.FILE_SIZE_MB);
  assert.equal(a.countdownS, BALANCE.COUNTDOWN_S);
  assert.deepEqual({ x: a.player.x, y: a.player.y }, LEVEL.start);
});

test('createSim ohne rng nutzt den globalen RNG (falls geladen)', (t) => {
  if (!Ch3Logic.hasGlobalRng()) {
    t.skip('src/core/rng.js ist noch ein Platzhalter');
    return;
  }
  const sim = Ch3Logic.createSim();
  assert.ok(Ch3Logic.TEXTS.FILE_NAMES.includes(sim.fileName));
});

test('vor dem Start passiert nichts; startSim startet Countdown und Download', () => {
  const sim = newSim();
  const events = run(sim, 1, { dx: 1, dy: 0 });
  assert.deepEqual(events, []);
  assert.equal(sim.player.x, LEVEL.start.x, 'keine Bewegung vor dem Start');
  assert.equal(sim.countdownS, BALANCE.COUNTDOWN_S);

  Ch3Logic.startSim(sim);
  assert.equal(sim.phase, 'running');
  run(sim, 2);
  assert.ok(Math.abs(sim.countdownS - (BALANCE.COUNTDOWN_S - 2)) < 0.05);
  assert.ok(sim.progressMB > 0, 'Download läuft (wenn auch langsam)');
});

test('isFrozen hält die Simulation an (Dialoge)', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  sim.isFrozen = true;
  const before = Ch3Logic.getSnapshot(sim);
  run(sim, 2, { dx: 1, dy: 0 });
  assert.deepEqual(Ch3Logic.getSnapshot(sim), before);
});

test('große Zeitsprünge werden begrenzt (MAX_DT_MS)', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  Ch3Logic.stepSim(sim, 5000, { dx: 0, dy: 0 });
  assert.ok(BALANCE.COUNTDOWN_S - sim.countdownS <= BALANCE.MAX_DT_MS / 1000 + 1e-9);
});

// ---------------------------------------------------------------------------
// Simulation: Bewegung
// ---------------------------------------------------------------------------

test('Bewegung: Pfeiltaste bewegt, diagonal ist normiert, Kaffee macht schneller', () => {
  // Innenhof-Ostband: keine Menschentrauben, kein nasser Boden, keine Funklöcher
  const origin = { x: 515, y: 320 };
  const distanceAfter = (input, prepare = () => {}) => {
    const sim = newSim();
    Ch3Logic.startSim(sim);
    sim.player.x = origin.x;
    sim.player.y = origin.y;
    prepare(sim);
    run(sim, 0.5, input);
    return Math.hypot(sim.player.x - origin.x, sim.player.y - origin.y);
  };
  const straight = distanceAfter({ dx: 0, dy: 1 });
  assert.ok(straight > 50, `zu langsam: ${straight}`);
  const diagonal = distanceAfter({ dx: 1, dy: 1 });
  assert.ok(Math.abs(diagonal - straight) < 3, `diagonal ${diagonal} ≈ gerade ${straight}`);
  const withCoffee = distanceAfter({ dx: 0, dy: 1 }, (sim) => { sim.effects.coffeeS = 5; });
  assert.ok(withCoffee > straight * 1.3, 'Kaffee beschleunigt');
});

test('Wände blockieren die Spielfigur', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  run(sim, 3, { dx: 0, dy: -1 }); // nach oben gegen die Außenwand
  const top = LEVEL.map.y;
  assert.ok(sim.player.y > top + BALANCE.PLAYER_RADIUS, 'bleibt im Gebäude');
  run(sim, 4, { dx: 1, dy: 0 }); // nach rechts gegen die Hörsaal-Ostwand
  assert.ok(sim.player.x < 268, `nicht durch die Wand: x=${sim.player.x}`);
});

test('Menschentraube bremst; nasser Boden ist rutschig', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  const erstis = sim.crowds.find((c) => c.id === 'erstis');
  sim.player.x = erstis.x;
  sim.player.y = erstis.y;
  run(sim, 0.5, { dx: 1, dy: 0 });
  const crowdDistance = sim.player.x - erstis.x;
  assert.ok(crowdDistance < 55, `in der Traube langsamer: ${crowdDistance}`);

  // Rutschig: Nach dem Loslassen gleitet man auf nassem Boden länger weiter.
  const slideDistance = (wet) => {
    const s = newSim();
    Ch3Logic.startSim(s);
    s.player.x = 515; // Innenhof-Ostband, weit weg vom Hausmeister
    s.player.y = 330;
    s.player.vx = BALANCE.BASE_SPEED;
    s.player.vy = 0;
    s.forceWet = wet; // Testhilfe: Nässe erzwingen bzw. verhindern
    const startX = s.player.x;
    run(s, 0.4, { dx: 0, dy: 0 });
    return s.player.x - startX;
  };
  assert.ok(slideDistance(true) > slideDistance(false) * 2, 'nasser Boden: deutlich längeres Gleiten');
});

test('Der Hausmeister wischt eine nasse Spur und rempelt (mit Abklingzeit)', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  run(sim, 0.1);
  assert.ok(sim.wetTrail.length > 3, 'nasse Spur vorhanden');
  assert.equal(Ch3Logic.isWetAt(sim, sim.janitor.x, sim.janitor.y), true, 'unter dem Hausmeister ist es nass');

  sim.player.x = sim.janitor.x + 4;
  sim.player.y = sim.janitor.y;
  const events = run(sim, 0.1);
  const bumps = events.filter((e) => e.type === 'janitor');
  assert.equal(bumps.length, 1);
  assert.equal(bumps[0].isAngry, true);
  assert.ok(Math.hypot(sim.player.x - sim.janitor.x, sim.player.y - sim.janitor.y) > 4, 'Rückstoß');
  sim.player.x = sim.janitor.x + 4;
  sim.player.y = sim.janitor.y;
  const again = run(sim, 0.6).filter((e) => e.type === 'janitor');
  assert.ok(again.every((e) => !e.isAngry), 'Frust nur einmal pro Abklingzeit');
});

test('S21-Baustelle blockiert und meldet sich (mit Abklingzeit)', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  const s21 = LEVEL.solids.find((s) => s.id === 's21');
  sim.player.x = s21.x - BALANCE.PLAYER_RADIUS - 6;
  sim.player.y = s21.y + s21.h / 2;
  const events = run(sim, 1.5, { dx: 1, dy: 0 });
  assert.equal(count(events, 'blocked'), 1);
  assert.ok(sim.player.x < s21.x, 'kommt nicht durch den Bauzaun');
});

// ---------------------------------------------------------------------------
// Simulation: Verbindung
// ---------------------------------------------------------------------------

test('Funkloch: Gnadenfrist, dann Abbruch (+Datenverlust), danach Neuverbindung', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  sim.progressMB = 10;
  const stairs = LEVEL.rooms.find((room) => room.id === 'treppenhaus');
  sim.player.x = stairs.x + stairs.w / 2;
  sim.player.y = stairs.y + stairs.h / 2;
  let events = run(sim, BALANCE.GRACE_S * 0.5);
  assert.ok(types(events).includes('grace-start'));
  assert.equal(sim.connection.state, 'grace');
  events = run(sim, BALANCE.GRACE_S);
  const disconnect = events.find((e) => e.type === 'disconnect');
  assert.ok(disconnect, 'Abbruch nach der Gnadenfrist');
  assert.equal(disconnect.deadzone, 'treppenhaus');
  assert.equal(sim.disconnects, 1);
  assert.equal(sim.connection.state, 'lost');
  assert.ok(sim.progressMB <= 10 - BALANCE.CHUNK_LOSS_MB + 0.01, 'angefangener Block verworfen');
  const lostProgress = sim.progressMB;
  run(sim, 1);
  assert.ok(sim.progressMB <= lostProgress, 'getrennt: kein Fortschritt');

  // raus aus dem Funkloch
  sim.player.x = 470;
  sim.player.y = 262;
  events = run(sim, 0.2);
  assert.ok(types(events).includes('reconnect-start'));
  assert.equal(sim.connection.state, 'reconnecting');
  events = run(sim, BALANCE.RECONNECT_S + 0.2);
  assert.ok(types(events).includes('reconnected'));
  assert.equal(sim.connection.state, 'connected');
});

test('Sprint durchs Treppenhaus bleibt ohne Abbruch (Gnadenfrist reicht)', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  const events = followRoute(sim, [{ x: 220, y: 248 }, { x: 420, y: 248 }]);
  assert.ok(types(events).includes('grace-start'), 'Funkloch wurde betreten');
  assert.ok(types(events).includes('grace-saved'), 'gerade noch gerettet');
  assert.equal(count(events, 'disconnect'), 0);
  assert.equal(sim.disconnects, 0);
});

test('Roaming: Wechsel zu einem deutlich besseren AP mit kurzer Neuanmeldung', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  sim.player.x = 470;
  sim.player.y = 262;
  const events = run(sim, 0.1);
  const roam = events.find((e) => e.type === 'roam');
  assert.ok(roam, 'Roaming-Ereignis');
  assert.equal(roam.to, 'flur');
  assert.equal(sim.connection.state, 'roaming');
  assert.equal(sim.rate, 0, 'während der Neuanmeldung kein Download');
  const later = run(sim, BALANCE.ROAM_S + 0.1);
  assert.ok(types(later).includes('roamed'));
  assert.equal(sim.connection.state, 'connected');
  assert.ok(sim.rate > 0);
});

// ---------------------------------------------------------------------------
// Simulation: Pickups
// ---------------------------------------------------------------------------

test('Brezeln zählen, beim Ziel kommt genau einmal "brezel-lover"', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  const brezels = sim.pickups.filter((p) => p.type === 'brezel');
  const all = [];
  for (const b of brezels) {
    sim.player.x = b.x;
    sim.player.y = b.y;
    all.push(...run(sim, 0.05));
  }
  assert.equal(sim.brezels, brezels.length);
  assert.equal(count(all, 'brezel-lover'), 1);
  const lover = all.findIndex((e) => e.type === 'brezel-lover');
  const pickupsBefore = all.slice(0, lover).filter((e) => e.type === 'pickup' && e.kind === 'brezel').length;
  assert.equal(pickupsBefore, BALANCE.BREZEL_GOAL);
  assert.ok(brezels.every((b) => b.isTaken));
});

test('Kaffee wirkt zeitlich begrenzt und kommt wieder; Repeater verstärkt schwaches Signal', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  const coffee = sim.pickups.find((p) => p.type === 'coffee');
  sim.player.x = coffee.x;
  sim.player.y = coffee.y;
  const events = run(sim, 0.05);
  assert.ok(events.some((e) => e.type === 'pickup' && e.kind === 'coffee'));
  assert.ok(sim.effects.coffeeS > 0);
  sim.player.x = 400;
  sim.player.y = 140;
  run(sim, BALANCE.COFFEE.S + 0.2);
  assert.equal(sim.effects.coffeeS, 0);
  run(sim, BALANCE.COFFEE.RESPAWN_S);
  assert.equal(coffee.isTaken, false, 'Automat füllt nach');

  const weakX = 300;
  const weakY = 330; // Innenhof-Nordwest: schwaches Signal
  const plain = Ch3Logic.evaluateSignal(weakX, weakY, { level: LEVEL, balance: BALANCE });
  const boosted = Ch3Logic.evaluateSignal(weakX, weakY, { level: LEVEL, balance: BALANCE, repeaterActive: true });
  assert.ok(boosted.bestQuality > plain.bestQuality + 0.1, 'Repeater hilft bei schwachem Signal');
  const full = Ch3Logic.evaluateSignal(LEVEL.bestSpot.x, LEVEL.bestSpot.y, { level: LEVEL, balance: BALANCE, repeaterActive: true });
  assert.ok(full.bestQuality <= 1);
});

// ---------------------------------------------------------------------------
// Simulation: Download, Wartungsfenster, Countdown
// ---------------------------------------------------------------------------

test('Am besten Platz: Wartungsfenster wird angekündigt, Roaming statt Abbruch, dann 99 % und fertig', () => {
  const sim = newSim(3);
  Ch3Logic.startSim(sim);
  sim.player.x = LEVEL.bestSpot.x;
  sim.player.y = LEVEL.bestSpot.y;
  const events = waitUntilDone(sim, BALANCE.COUNTDOWN_S);
  const list = types(events);
  assert.equal(sim.phase, 'done', `nicht fertig: ${Ch3Logic.formatMB(sim.progressMB)}`);
  for (const type of ['outage-warning', 'outage-start', 'stall-start', 'complete']) {
    assert.ok(list.includes(type), `${type} fehlt`);
  }
  assert.ok(list.indexOf('outage-warning') < list.indexOf('outage-start'));
  assert.equal(count(events, 'disconnect'), 0, 'Wartungsfenster trennt nicht, man roamt');
  assert.equal(count(events, 'expired'), 0);
  assert.ok(list.indexOf('stall-start') < list.indexOf('complete'));
  assert.equal(sim.progressMB, sim.sizeMB);
});

test('99-%-Hänger: Fortschritt bleibt kurz bei 99 % stehen', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  sim.player.x = LEVEL.bestSpot.x;
  sim.player.y = LEVEL.bestSpot.y;
  sim.outage.state = 'done';
  sim.progressMB = sim.sizeMB * 0.985;
  const events = run(sim, 2);
  assert.ok(types(events).includes('stall-start'));
  assert.equal(sim.phase, 'stalling');
  assert.ok(Math.abs(sim.progressMB - sim.sizeMB * BALANCE.STALL_AT) < 1e-9);
  const rest = run(sim, BALANCE.STALL_S);
  assert.ok(types(rest).includes('complete'));
  assert.equal(sim.phase, 'done');
});

test('Countdown abgelaufen: Fail-Ereignis, Restfortschritt bleibt, neuer Countdown', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  sim.progressMB = 30;
  sim.countdownS = 0.5;
  sim.player.x = 60; // Hörsaal (langsam)
  sim.player.y = 190;
  const events = runUntil(sim, 'expired', 2);
  const expired = events.find((e) => e.type === 'expired');
  assert.ok(expired, 'expired fehlt');
  assert.equal(sim.expiries, 1);
  assert.equal(expired.expiries, 1);
  assert.ok(Math.abs(sim.countdownS - BALANCE.RETRY_COUNTDOWN_S) < 0.05);
  assert.equal(expired.residualMB, sim.progressMB);
  assert.ok(sim.progressMB >= 30 * BALANCE.RESIDUAL_FACTOR - 0.01 && sim.progressMB < 30, `Rest ${sim.progressMB}`);
  assert.equal(sim.phase, 'running');
});

test('Restfortschritt: nie mehr als vorher, aber mindestens der Sockel', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  sim.progressMB = 4; // wenig geladen → alles bleibt
  sim.countdownS = 0.01;
  run(sim, 0.1);
  assert.ok(Math.abs(sim.progressMB - 4) < 0.2);
  sim.progressMB = 40; // viel geladen → mindestens Sockel des 2. Ablaufs
  sim.countdownS = 0.01;
  run(sim, 0.05);
  assert.equal(sim.expiries, 2);
  assert.ok(sim.progressMB >= sim.sizeMB * BALANCE.RESIDUAL_MIN[1] - 0.2);
});

test('keine Sackgasse: Wer nur im Hörsaal steht, bekommt nach MAX_EXPIRIES den Gnaden-Abschluss', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  const events = waitUntilDone(sim, BALANCE.COUNTDOWN_S + BALANCE.RETRY_COUNTDOWN_S * BALANCE.MAX_EXPIRIES + 10);
  assert.equal(count(events, 'expired'), BALANCE.MAX_EXPIRIES - 1);
  assert.equal(count(events, 'mercy'), 1);
  assert.equal(count(events, 'complete'), 0);
  assert.equal(sim.phase, 'done');
  const hints = events.filter((e) => e.type === 'hint').map((e) => e.id);
  assert.ok(hints.includes('hall'), 'Hörsaal-Hinweis');
  assert.ok(hints.includes('slow'), 'Mitleids-Tipp bei langsamem Download');
  assert.ok(count(events, 'trickle') > 5, 'Ladebalken-Frust tröpfelt');
});

test('Mitleids-Tipp nach wiederholten Funkloch-Abbrüchen', () => {
  const sim = newSim();
  Ch3Logic.startSim(sim);
  const stairs = LEVEL.rooms.find((room) => room.id === 'treppenhaus');
  const all = [];
  for (let i = 0; i < BALANCE.DEADZONE_HINT_AFTER; i++) {
    sim.player.x = stairs.x + stairs.w / 2;
    sim.player.y = stairs.y + stairs.h / 2;
    all.push(...run(sim, BALANCE.GRACE_S + 0.3));
    sim.player.x = 470;
    sim.player.y = 262;
    all.push(...run(sim, BALANCE.RECONNECT_S + 0.5));
  }
  assert.equal(sim.disconnects, BALANCE.DEADZONE_HINT_AFTER);
  const hint = all.find((e) => e.type === 'hint' && e.id === 'deadzone');
  assert.ok(hint, 'Funkloch-Tipp fehlt');
});

test('Hörsaal-Hinweis kommt nur, wenn man noch im Hörsaal steht', () => {
  const stay = newSim();
  Ch3Logic.startSim(stay);
  const stayed = run(stay, BALANCE.HALL_NUDGE_S + 0.2);
  assert.ok(stayed.some((e) => e.type === 'hint' && e.id === 'hall'));

  const leave = newSim();
  Ch3Logic.startSim(leave);
  const left = [...followRoute(leave, [{ x: 220, y: 248 }, { x: 120, y: 248 }]), ...run(leave, BALANCE.HALL_NUDGE_S)];
  assert.ok(!left.some((e) => e.type === 'hint' && e.id === 'hall'));
});

test('solveSim schließt aus jeder Phase ab', () => {
  for (const prepare of [(s) => s, (s) => Ch3Logic.startSim(s), (s) => { Ch3Logic.startSim(s); s.isFrozen = true; }]) {
    const sim = newSim();
    prepare(sim);
    const events = Ch3Logic.solveSim(sim);
    assert.equal(sim.phase, 'done');
    assert.equal(sim.progressMB, sim.sizeMB);
    assert.equal(sim.isFrozen, false);
    assert.ok(types(events).includes('complete'));
  }
});

test('getSnapshot liefert flache, JSON-taugliche Testdaten', () => {
  const sim = newSim();
  const snap = Ch3Logic.getSnapshot(sim);
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
  for (const key of ['phase', 'player', 'room', 'connection', 'apId', 'bars', 'rate', 'progress', 'progressMB',
    'countdownS', 'expiries', 'disconnects', 'brezels', 'coffeeS', 'repeaterS', 'outage']) {
    assert.ok(key in snap, `${key} fehlt im Snapshot`);
  }
});

// ---------------------------------------------------------------------------
// Balance über simulierte Laufwege
// ---------------------------------------------------------------------------

test('Balance: kürzeste Route (Treppenhaus-Sprint) schafft es klar vor dem Countdown, ohne Abbruch', () => {
  for (const seed of [1, 7, 42]) {
    const sim = newSim(seed);
    Ch3Logic.startSim(sim);
    const events = [...followRoute(sim, SHORT_ROUTE), ...waitUntilDone(sim, BALANCE.COUNTDOWN_S)];
    assert.equal(sim.phase, 'done', `Seed ${seed}: nicht fertig`);
    assert.equal(count(events, 'complete'), 1);
    assert.equal(sim.disconnects, 0, `Seed ${seed}: Abbruch auf der kurzen Route`);
    assert.equal(sim.expiries, 0);
    assert.ok(sim.t < BALANCE.COUNTDOWN_S * 0.75, `Seed ${seed}: ${sim.t.toFixed(1)} s ist zu knapp`);
    assert.ok(sim.t > 40, `Seed ${seed}: ${sim.t.toFixed(1)} s ist zu kurz für ein Kapitel`);
  }
});

test('Balance: sichere Route über den Innenhof meidet alle Funklöcher und schafft es rechtzeitig', () => {
  for (const seed of [2, 7]) {
    const sim = newSim(seed);
    Ch3Logic.startSim(sim);
    const events = [...followRoute(sim, SAFE_ROUTE), ...waitUntilDone(sim, BALANCE.COUNTDOWN_S)];
    assert.equal(count(events, 'grace-start'), 0, `Seed ${seed}: Funkloch betreten`);
    assert.equal(sim.phase, 'done');
    assert.equal(sim.expiries, 0, `Seed ${seed}: Countdown abgelaufen (${sim.t.toFixed(1)} s)`);
  }
});

test('Balance: Frust-Ereignisse eines vernünftigen Laufs bleiben im Budget', () => {
  const sim = newSim(7);
  Ch3Logic.startSim(sim);
  const events = [...followRoute(sim, SHORT_ROUTE), ...waitUntilDone(sim, BALANCE.COUNTDOWN_S)];
  const frust = Ch3Logic.estimateFrustration(events);
  assert.ok(frust >= 4 && frust <= 20, `Brutto-Frust ${frust} % außerhalb des Budgets`);
});

/**
 * Netto-Frust wie im Spiel: Brutto minus Brezeln minus Abschluss-Bonus von succeed()
 * (CONFIG.FRUSTRATION.SMALL), nie unter 0.
 */
function netFrustration(events) {
  const brezels = events.filter((e) => e.type === 'pickup' && e.kind === 'brezel').length;
  const relief = brezels * BALANCE.FEEDBACK.BREZEL_RELIEF + CONFIG.FRUSTRATION.SMALL;
  return Math.max(0, Ch3Logic.estimateFrustration(events) - relief);
}

/** Folgt einem Plan aus Wegpunkten und Wartezeiten ({ wait: s }), danach bis zum Ende warten. */
function playPlan(sim, plan) {
  const events = [];
  for (const step of plan) {
    if (sim.phase === 'done') break;
    if (step.wait) events.push(...run(sim, step.wait));
    else events.push(...steerTo(sim, step));
  }
  events.push(...waitUntilDone(sim, BALANCE.COUNTDOWN_S + BALANCE.RETRY_COUNTDOWN_S * BALANCE.MAX_EXPIRIES));
  return events;
}

test('Balance: normaler Erstlauf (Hörsaal-Trödeln, ein Abbruch im Treppenhaus) landet bei 8–12 % netto', () => {
  const plan = [
    { wait: 6.5 },                       // Erstspieler schaut sich im Hörsaal um → Hörsaal-Hinweis
    { x: 220, y: 248 }, { x: 300, y: 248 }, { wait: 1.4 }, // im Treppenhaus stehen geblieben → Abbruch
    { x: 385, y: 248 }, { x: 385, y: 110 }, LEVEL.bestSpot,
  ];
  for (const seed of [1, 7, 42]) {
    const sim = newSim(seed);
    Ch3Logic.startSim(sim);
    const events = playPlan(sim, plan);
    const net = netFrustration(events);
    assert.equal(sim.disconnects, 1, `Seed ${seed}: genau ein Abbruch`);
    assert.equal(sim.expiries, 0, `Seed ${seed}: Frist gehalten`);
    assert.ok(net >= 8 && net <= 12, `Seed ${seed}: ${net} % netto außerhalb von 8–12 %`);
  }
});

test('Balance: Schludern (drei Abbrüche, viel Trödeln) kostet 25–35 % netto, aber ohne Sackgasse', () => {
  const plan = [
    { wait: 12 },
    { x: 220, y: 248 }, { x: 300, y: 248 }, { wait: 1.5 }, { x: 220, y: 248 }, { wait: 3 },
    { x: 300, y: 248 }, { wait: 1.5 }, { x: 150, y: 248 }, { x: 65, y: 248 }, { x: 65, y: 330 },
    { x: 150, y: 400 }, { wait: 15 }, { x: 65, y: 425 }, { x: 65, y: 500 }, { x: 60, y: 540 }, { wait: 1.5 },
    { x: 85, y: 470 }, { x: 65, y: 425 }, { x: 300, y: 425 }, { x: 300, y: 330 }, { wait: 10 },
    { x: 545, y: 328 }, { x: 545, y: 262 }, { x: 385, y: 262 }, { x: 385, y: 110 }, LEVEL.bestSpot,
  ];
  for (const seed of [1, 7, 42]) {
    const sim = newSim(seed);
    Ch3Logic.startSim(sim);
    const events = playPlan(sim, plan);
    const net = netFrustration(events);
    assert.equal(sim.phase, 'done', `Seed ${seed}: fertig`);
    assert.equal(sim.disconnects, 3, `Seed ${seed}: drei Abbrüche`);
    assert.ok(net >= 25 && net <= 35, `Seed ${seed}: ${net} % netto außerhalb von 25–35 %`);
  }
});
