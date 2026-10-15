/**
 * ch4.test.js – Unit-Tests für die Logik von Kapitel 4 „Das Zertifikat“
 * (src/logic/ch4Certificates.js, Global Ch4Logic).
 *
 * Prüft: Referenz aus CAMPUS, isTrustworthy für echte, erneuerte und gefälschte Zertifikate
 * (inkl. Begründungen), Fingerabdruck- und Datums-Helfer, Rundenplan (4 automatische Runden +
 * Finale mit drei Netzen), Spielablauf (enttarnt, gephisht, paranoid, Countdown, Tipps,
 * keine Sackgasse), Frust-Budget laut Vertrag, Determinismus mit Seed und Reinheit der Logik
 * (kein Phaser/DOM/Math.random).
 *
 * Geladen werden die echten Kern-Dateien (CORE_LOGIC_FILES). Die meisten Tests nutzen trotzdem
 * ein eigenes, seedbares Test-RNG mit derselben Schnittstelle wie RNG – so bleiben die erwarteten
 * Rundenpläne unabhängig vom Seed-Algorithmus des Kerns. Der letzte Test spielt mit dem echten RNG.
 * Aufruf: node --test "tests/unit/ch4.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadScripts, CORE_LOGIC_FILES, ROOT } = require('./_load.js');

const LOGIC_FILE = 'src/logic/ch4Certificates.js';
const { CONFIG, CAMPUS, Ch4Logic } = loadScripts([...CORE_LOGIC_FILES, LOGIC_FILE], ['CONFIG', 'CAMPUS', 'Ch4Logic']);

/** Echtes RNG aus dem Kern (null nur, falls rng.js fehlt). */
const REAL_RNG = vm.runInThisContext("typeof RNG !== 'undefined' && RNG && typeof RNG.next === 'function' ? RNG : null");

const { KIND, OUTCOME, CODE, STATUS, DECISION } = Ch4Logic;
const FAKE_KINDS = [KIND.TYPO, KIND.SUFFIX, KIND.HOMOGLYPH, KIND.SELF_SIGNED, KIND.EXPIRED, KIND.WRONG_CA, KIND.COPY];
const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 2026];

/**
 * Kleiner, seedbarer Test-Zufall (Mulberry32) mit der Schnittstelle von RNG.
 * @param {number} seed
 */
function makeTestRng(seed = 1) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (array) => array[int(0, array.length - 1)],
    shuffle: (array) => {
      const copy = array.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

/** Neues Spiel mit Test-RNG. */
function newGame(seed = 7) {
  return new Ch4Logic.Game({ campus: CAMPUS, rng: makeTestRng(seed) });
}

/** Index des ersten Netzes der aktuellen Runde mit diesem Zertifikatstyp (oder -1). */
function indexOfKind(game, kind) {
  return game.getNetworks().findIndex((net) => net.kind === kind);
}

/** Index des Netzes, das Android in einer automatischen Runde anwählt. */
function featuredIndex(game) {
  return game.getNetworks().findIndex((net) => net.featured);
}

/** Richtige Entscheidung für ein Netz der aktuellen Runde. */
function correctDecision(game, index) {
  return game.getNetworks()[index].trustworthy ? DECISION.TRUST : DECISION.REJECT;
}

/**
 * Spielt ein komplettes Kapitel mit einer Strategie und summiert den Frust laut
 * Ch4Logic.getPenalty (plus Update-Meldung, minus Erleichterung bei succeed()).
 * @param {Ch4Logic.Game} game
 * @param {(game, index, round) => string} decideAuto Entscheidung in Runde 1–4
 * @param {(game) => Array<[number, string]>} finaleMoves Züge im Finale (Index, Entscheidung)
 */
function playThrough(game, decideAuto, finaleMoves) {
  let frustration = Ch4Logic.BALANCE.UPDATE_FRUSTRATION;
  const results = [];
  while (!game.isFinale()) {
    const index = featuredIndex(game);
    const result = game.decide(index, decideAuto(game, index, game.getRoundNumber()));
    assert.ok(result, `Entscheidung in Runde ${game.getRoundNumber()} wurde ignoriert`);
    frustration += Ch4Logic.getPenalty(result).frustration;
    results.push(result);
    assert.equal(result.roundComplete, true, 'automatische Runden enden mit jeder Entscheidung');
    game.advance();
  }
  for (const [index, decision] of finaleMoves(game)) {
    const result = game.decide(index, decision);
    assert.ok(result, `Zug ${decision} auf Netz ${index} im Finale wurde ignoriert`);
    frustration += Ch4Logic.getPenalty(result).frustration;
    results.push(result);
  }
  assert.equal(game.isFinished(), true, 'Kapitel muss nach den Zügen geschafft sein');
  return { frustration: frustration - CONFIG.FRUSTRATION.SMALL, results };
}

// ---------------------------------------------------------------------------
// Grundwerte und Referenz
// ---------------------------------------------------------------------------

test('Ch4Logic: Grundwerte laut Briefing, eingefroren', () => {
  assert.equal(Ch4Logic.ROUND_COUNT, 5);
  assert.equal(Ch4Logic.COUNTDOWN_MS, 10000);
  assert.ok(Object.isFrozen(Ch4Logic));
  assert.ok(Object.isFrozen(Ch4Logic.TEXTS));
  assert.equal(typeof Ch4Logic.isTrustworthy, 'function');
  assert.equal(typeof Ch4Logic.Game, 'function');
});

test('buildReference übernimmt die Werte aus CAMPUS.certificate; Rundmail nur auf Wunsch', () => {
  const cert = CAMPUS.certificate;
  const withNews = Ch4Logic.buildReference(CAMPUS);
  assert.equal(withNews.serverName, cert.serverName);
  assert.equal(withNews.issuer, cert.issuer);
  assert.equal(withNews.rootCA, cert.rootCA);
  assert.equal(withNews.validFrom, cert.validFrom);
  assert.equal(withNews.validTo, cert.validTo);
  assert.equal(withNews.sha256, cert.sha256);
  assert.equal(withNews.today, Ch4Logic.GAME_DATE);
  const sources = withNews.trustedFingerprints.map((entry) => entry.source);
  assert.deepEqual(sources, ['it-page', 'it-news']);
  assert.equal(withNews.trustedFingerprints[1].sha256, Ch4Logic.RENEWAL.sha256);

  const printed = Ch4Logic.buildReference(CAMPUS, { includeNews: false });
  assert.deepEqual(printed.trustedFingerprints.map((entry) => entry.source), ['it-page']);
});

test('Spieldatum liegt in der Gültigkeit des CAMPUS-Zertifikats und des erneuerten Zertifikats', () => {
  const today = Ch4Logic.parseDate(Ch4Logic.GAME_DATE);
  assert.ok(Ch4Logic.parseDate(CAMPUS.certificate.validFrom) <= today);
  assert.ok(Ch4Logic.parseDate(CAMPUS.certificate.validTo) >= today);
  assert.ok(Ch4Logic.parseDate(Ch4Logic.RENEWAL.validFrom) <= today);
  assert.ok(Ch4Logic.parseDate(Ch4Logic.RENEWAL.validTo) >= today);
  assert.notEqual(
    Ch4Logic.normalizeFingerprint(Ch4Logic.RENEWAL.sha256),
    Ch4Logic.normalizeFingerprint(CAMPUS.certificate.sha256),
    'der Zertifikatswechsel braucht einen neuen Fingerabdruck'
  );
});

// ---------------------------------------------------------------------------
// isTrustworthy
// ---------------------------------------------------------------------------

test('isTrustworthy: echtes Zertifikat (Werte aus CAMPUS) ist vertrauenswürdig', () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  const cert = Ch4Logic.makeCertificate(KIND.GENUINE, { campus: CAMPUS, rng: makeTestRng(1) });
  assert.equal(cert.serverName, CAMPUS.certificate.serverName);
  assert.equal(cert.organization, CAMPUS.name);
  const verdict = Ch4Logic.isTrustworthy(cert, reference);
  assert.equal(verdict.trustworthy, true);
  assert.deepEqual(verdict.reasons, []);
  assert.deepEqual(verdict.codes, []);
  assert.ok(Object.values(verdict.fields).every(Boolean), 'alle Felder grün');
});

test('isTrustworthy akzeptiert CAMPUS.certificate direkt als Referenz (Vertragsform)', () => {
  const verdict = Ch4Logic.isTrustworthy({ ...CAMPUS.certificate }, CAMPUS.certificate);
  assert.equal(verdict.trustworthy, true, verdict.reasons.join(' | '));
  const fake = { ...CAMPUS.certificate, sha256: Ch4Logic.RENEWAL.sha256 };
  assert.equal(Ch4Logic.isTrustworthy(fake, CAMPUS.certificate).trustworthy, false);
});

test('Fingerabdruck-Vergleich ignoriert Groß-/Kleinschreibung, Leerzeichen und Doppelpunkte', () => {
  const sloppy = CAMPUS.certificate.sha256.toLowerCase().replace(/:/g, ' ');
  const cert = { ...CAMPUS.certificate, sha256: sloppy };
  assert.equal(Ch4Logic.isTrustworthy(cert, CAMPUS.certificate).trustworthy, true);
  assert.equal(Ch4Logic.normalizeFingerprint('ab:Cd ef'), 'ABCDEF');
  assert.equal(Ch4Logic.normalizeFingerprint(null), '');
});

test('Servername-Vergleich ignoriert Groß-/Kleinschreibung', () => {
  const cert = { ...CAMPUS.certificate, serverName: CAMPUS.certificate.serverName.toUpperCase() };
  assert.equal(Ch4Logic.isTrustworthy(cert, CAMPUS.certificate).trustworthy, true);
});

test('Tippfehler-Domain wird erkannt (sichtbarer Unterschied, kein Homoglyph, kein Anhängsel)', () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  for (const seed of SEEDS) {
    const cert = Ch4Logic.makeCertificate(KIND.TYPO, { campus: CAMPUS, rng: makeTestRng(seed) });
    assert.notEqual(cert.serverName.toLowerCase(), reference.serverName.toLowerCase());
    assert.ok(/^[\x20-\x7e]+$/.test(cert.serverName), `nur ASCII: ${cert.serverName}`);
    assert.ok(Math.abs(cert.serverName.length - reference.serverName.length) <= 1, cert.serverName);
    const verdict = Ch4Logic.isTrustworthy(cert, reference);
    assert.equal(verdict.trustworthy, false);
    assert.ok(verdict.codes.includes(CODE.SERVER_NAME), verdict.codes.join(','));
    assert.ok(!verdict.codes.includes(CODE.SUFFIX) && !verdict.codes.includes(CODE.HOMOGLYPH));
    assert.equal(verdict.fields.serverName, false);
    assert.ok(verdict.reasons[0].includes(cert.serverName), 'Begründung nennt den falschen Namen');
  }
});

test('…dhbw-stuttgart.de.evil.example wird als angehängte Domain erkannt und in der Vorschau gekürzt', () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  const cert = Ch4Logic.makeCertificate(KIND.SUFFIX, { campus: CAMPUS, rng: makeTestRng(3) });
  assert.ok(cert.serverName.startsWith(`${reference.serverName}.`), cert.serverName);
  assert.ok(cert.serverName.endsWith('.example'), 'Fälschungs-Domains bleiben .example');
  const verdict = Ch4Logic.isTrustworthy(cert, reference);
  assert.equal(verdict.trustworthy, false);
  assert.ok(verdict.codes.includes(CODE.SUFFIX));
  assert.ok(!verdict.codes.includes(CODE.SERVER_NAME));

  // Vorschau (kompakte Ansicht): echter Name passt ganz, die Fälschung endet mit „…“
  const max = reference.serverName.length;
  assert.equal(Ch4Logic.truncateServerName(reference.serverName, max), reference.serverName);
  assert.equal(Ch4Logic.truncateServerName(cert.serverName, max), `${reference.serverName}…`);
});

test('Homoglyph (kyrillisches Zeichen) wird erkannt, obwohl der Name gleich aussieht', () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  const cert = Ch4Logic.makeCertificate(KIND.HOMOGLYPH, { campus: CAMPUS, rng: makeTestRng(5) });
  assert.notEqual(cert.serverName, reference.serverName);
  assert.equal(cert.serverName.length, reference.serverName.length);
  assert.ok(/[^\x20-\x7e]/.test(cert.serverName), 'enthält ein Nicht-ASCII-Zeichen');
  assert.equal(Ch4Logic.foldHomoglyphs(cert.serverName), reference.serverName);
  const verdict = Ch4Logic.isTrustworthy(cert, reference);
  assert.equal(verdict.trustworthy, false);
  assert.ok(verdict.codes.includes(CODE.HOMOGLYPH));
  assert.ok(verdict.codes.includes(CODE.FINGERPRINT));
  assert.ok(/kyrillisch/.test(verdict.reasons.join(' ')), verdict.reasons.join(' | '));
});

test("selbstsigniert (z. B. „Kevin's CA“) wird erkannt – Servername stimmt trotzdem", () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  for (const seed of SEEDS) {
    const cert = Ch4Logic.makeCertificate(KIND.SELF_SIGNED, { campus: CAMPUS, rng: makeTestRng(seed) });
    assert.equal(cert.serverName, reference.serverName);
    assert.equal(cert.issuer, cert.rootCA);
    const verdict = Ch4Logic.isTrustworthy(cert, reference);
    assert.equal(verdict.trustworthy, false);
    for (const code of [CODE.SELF_SIGNED, CODE.ISSUER, CODE.ROOT_CA, CODE.FINGERPRINT]) {
      assert.ok(verdict.codes.includes(code), `${code} fehlt: ${verdict.codes.join(',')}`);
    }
  }
  const kevin = { ...CAMPUS.certificate, issuer: "Kevin's CA", rootCA: "Kevin's CA" };
  const verdict = Ch4Logic.isTrustworthy(kevin, reference);
  assert.ok(verdict.reasons.some((reason) => reason.includes("Kevin's CA")));
});

test('abgelaufenes Zertifikat wird erkannt; Gültigkeitsgrenzen sind inklusive', () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  for (const seed of SEEDS) {
    const cert = Ch4Logic.makeCertificate(KIND.EXPIRED, { campus: CAMPUS, rng: makeTestRng(seed) });
    const verdict = Ch4Logic.isTrustworthy(cert, reference);
    assert.equal(verdict.trustworthy, false);
    assert.ok(verdict.codes.includes(CODE.EXPIRED));
    assert.equal(verdict.fields.validity, false);
  }
  const lastDay = { ...CAMPUS.certificate, validTo: Ch4Logic.GAME_DATE };
  assert.ok(!Ch4Logic.isTrustworthy(lastDay, reference).codes.includes(CODE.EXPIRED), 'am letzten Tag noch gültig');
  const firstDay = { ...CAMPUS.certificate, validFrom: Ch4Logic.GAME_DATE };
  assert.ok(!Ch4Logic.isTrustworthy(firstDay, reference).codes.includes(CODE.NOT_YET_VALID), 'ab dem ersten Tag gültig');
});

test('noch nicht gültiges Zertifikat und unlesbare Daten werden erkannt', () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  const future = { ...CAMPUS.certificate, validFrom: '01.01.2030', validTo: '01.01.2031' };
  assert.ok(Ch4Logic.isTrustworthy(future, reference).codes.includes(CODE.NOT_YET_VALID));
  const broken = { ...CAMPUS.certificate, validTo: 'irgendwann' };
  const verdict = Ch4Logic.isTrustworthy(broken, reference);
  assert.equal(verdict.trustworthy, false);
  assert.equal(verdict.fields.validity, false);
});

test('falsche CA (öffentlich gültig, aber für Kevins Domain) wird erkannt', () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  const cert = Ch4Logic.makeCertificate(KIND.WRONG_CA, { campus: CAMPUS, rng: makeTestRng(11) });
  assert.ok(cert.serverName.endsWith('.example'));
  const verdict = Ch4Logic.isTrustworthy(cert, reference);
  for (const code of [CODE.SERVER_NAME, CODE.ISSUER, CODE.ROOT_CA, CODE.FINGERPRINT]) {
    assert.ok(verdict.codes.includes(code), `${code} fehlt: ${verdict.codes.join(',')}`);
  }
});

test('perfekte Kopie: nur der Fingerabdruck verrät sie – Anfang und Ende passen sogar', () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  for (const seed of SEEDS) {
    const cert = Ch4Logic.makeCertificate(KIND.COPY, { campus: CAMPUS, rng: makeTestRng(seed) });
    for (const field of ['serverName', 'issuer', 'rootCA', 'validFrom', 'validTo']) {
      assert.equal(cert[field], reference[field], `${field} abgeschrieben`);
    }
    const verdict = Ch4Logic.isTrustworthy(cert, reference);
    assert.deepEqual(verdict.codes, [CODE.FINGERPRINT]);
    const diff = Ch4Logic.diffFingerprintGroups(cert.sha256, reference.sha256);
    assert.ok(diff.length >= 6, `mindestens 6 Gruppen anders, sind ${diff.length}`);
    assert.ok(diff.every((i) => i >= 2 && i <= 29), `nur die Mitte weicht ab: ${diff.join(',')}`);
  }
});

test('legitimer Zertifikatswechsel: mit IT-Rundmail vertrauenswürdig, nur mit dem Ausdruck nicht', () => {
  const cert = Ch4Logic.makeCertificate(KIND.RENEWED, { campus: CAMPUS, rng: makeTestRng(1) });
  assert.equal(cert.serverName, CAMPUS.certificate.serverName);
  assert.equal(cert.issuer, CAMPUS.certificate.issuer);
  assert.equal(cert.rootCA, CAMPUS.certificate.rootCA);
  assert.equal(cert.validFrom, Ch4Logic.RENEWAL.validFrom);
  assert.equal(Ch4Logic.isTrustworthy(cert, Ch4Logic.buildReference(CAMPUS)).trustworthy, true);
  const printedOnly = Ch4Logic.isTrustworthy(cert, Ch4Logic.buildReference(CAMPUS, { includeNews: false }));
  assert.equal(printedOnly.trustworthy, false);
  assert.deepEqual(printedOnly.codes, [CODE.FINGERPRINT]);
  assert.match(printedOnly.reasons[0], /Ausdruck/);
});

test('jede Fälschung hat einen anderen Fingerabdruck als alle echten Zertifikate (nicht fälschbar)', () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  const trusted = reference.trustedFingerprints.map((entry) => Ch4Logic.normalizeFingerprint(entry.sha256));
  for (const seed of SEEDS) {
    const rng = makeTestRng(seed);
    for (const kind of FAKE_KINDS) {
      const cert = Ch4Logic.makeCertificate(kind, { campus: CAMPUS, rng });
      const hex = Ch4Logic.normalizeFingerprint(cert.sha256);
      assert.equal(hex.length, 64, `${kind}: 32 Byte`);
      assert.ok(!trusted.includes(hex), `${kind} (Seed ${seed}) hat einen echten Fingerabdruck`);
      assert.equal(Ch4Logic.isTrustworthy(cert, reference).trustworthy, false, `${kind} (Seed ${seed}) gilt als echt`);
      assert.equal(cert.kind, kind);
    }
  }
});

test('isTrustworthy ist robust gegen fehlende Zertifikate und Felder', () => {
  const reference = Ch4Logic.buildReference(CAMPUS);
  const none = Ch4Logic.isTrustworthy(null, reference);
  assert.equal(none.trustworthy, false);
  assert.ok(none.reasons.length > 0);
  const empty = Ch4Logic.isTrustworthy({}, reference);
  assert.equal(empty.trustworthy, false);
  assert.ok(empty.codes.includes(CODE.SERVER_NAME));
  assert.ok(empty.codes.includes(CODE.FINGERPRINT));
  assert.doesNotThrow(() => Ch4Logic.isTrustworthy({ ...CAMPUS.certificate }, null));
  assert.equal(Ch4Logic.isTrustworthy({ ...CAMPUS.certificate }, null).trustworthy, false);
});

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

test('Fingerabdruck-Helfer: 32 Gruppen, 4 Zeilen à 8, Unterschiede je Gruppe', () => {
  const rows = Ch4Logic.formatFingerprintRows(CAMPUS.certificate.sha256);
  assert.equal(rows.length, 4);
  rows.forEach((row) => assert.equal(row.split(':').length, 8));
  assert.equal(rows.join(':'), Ch4Logic.formatFingerprint(CAMPUS.certificate.sha256));
  assert.equal(Ch4Logic.fingerprintGroups(CAMPUS.certificate.sha256).length, 32);
  assert.deepEqual(Ch4Logic.diffFingerprintGroups(CAMPUS.certificate.sha256, CAMPUS.certificate.sha256), []);
  assert.deepEqual(Ch4Logic.diffFingerprintGroups('AA:BB:CC', 'AA:BC:CC'), [1]);
});

test('parseDate versteht TT.MM.JJJJ und JJJJ-MM-TT, sonst NaN', () => {
  assert.equal(Ch4Logic.parseDate('12.10.2026'), 20261012);
  assert.equal(Ch4Logic.parseDate('2027-03-31'), 20270331);
  assert.ok(Number.isNaN(Ch4Logic.parseDate('morgen')));
  assert.ok(Number.isNaN(Ch4Logic.parseDate(undefined)));
});

test('signalLevel bildet dBm auf 0–4 Balken ab', () => {
  assert.equal(Ch4Logic.signalLevel(-40), 4);
  assert.equal(Ch4Logic.signalLevel(-58), 3);
  assert.equal(Ch4Logic.signalLevel(-66), 2);
  assert.equal(Ch4Logic.signalLevel(-75), 1);
  assert.equal(Ch4Logic.signalLevel(-90), 0);
});

// ---------------------------------------------------------------------------
// Rundenplan
// ---------------------------------------------------------------------------

test('createRounds: 4 automatische Runden + Finale mit drei Netzen und genau einem echten', () => {
  for (const seed of SEEDS) {
    const rounds = Ch4Logic.createRounds(CAMPUS, makeTestRng(seed));
    assert.equal(rounds.length, Ch4Logic.ROUND_COUNT);
    rounds.forEach((round, index) => {
      assert.equal(round.number, index + 1);
      assert.equal(round.networks.length, 3, 'immer drei Netze „eduroam“');
      round.networks.forEach((net) => {
        assert.equal(net.ssid, CAMPUS.wifi.ssid);
        assert.match(net.bssid, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/);
        assert.ok(net.level >= 0 && net.level <= 4);
      });
      const bssids = new Set(round.networks.map((net) => net.bssid));
      assert.equal(bssids.size, 3, 'BSSIDs pro Runde verschieden');
      const dbms = round.networks.map((net) => net.dbm);
      assert.deepEqual(dbms, [...dbms].sort((a, b) => b - a), 'Liste nach Signalstärke sortiert (wie Android)');
      assert.ok(typeof round.place === 'string' && round.place.length > 0);
      assert.ok(typeof round.intro === 'string' && round.intro.length > 0);
    });

    const autoRounds = rounds.slice(0, 4);
    autoRounds.forEach((round) => {
      assert.equal(round.mode, 'auto');
      const featured = round.networks.filter((net) => net.featured);
      assert.equal(featured.length, 1, 'genau ein Netz wird automatisch angewählt');
      assert.equal(round.networks[0].featured, true, 'Android wählt das stärkste Signal');
      assert.ok(featured[0].cert, 'angewähltes Netz hat ein Zertifikat');
    });
    const autoKinds = autoRounds.map((round) => round.networks[0].kind);
    assert.equal(autoKinds[0], KIND.TYPO, 'Runde 1: der Klassiker');
    assert.ok(autoKinds.slice(1, 3).includes(KIND.GENUINE), 'Runde 2 oder 3 ist echt');
    assert.ok(
      autoKinds.slice(1, 3).some((kind) => [KIND.SELF_SIGNED, KIND.EXPIRED, KIND.WRONG_CA].includes(kind)),
      'Runde 2 oder 3: selbstsigniert, abgelaufen oder falsche CA'
    );
    assert.ok([KIND.COPY, KIND.HOMOGLYPH].includes(autoKinds[3]), 'Runde 4: perfekte Kopie oder Homoglyph');

    const finale = rounds[4];
    assert.equal(finale.mode, 'choice');
    assert.ok(finale.networks.every((net) => net.cert && !net.featured));
    assert.deepEqual(finale.networks.map((net) => net.kind).sort(), [KIND.COPY, KIND.RENEWED, KIND.SUFFIX].sort());
    const reference = Ch4Logic.buildReference(CAMPUS);
    const genuine = finale.networks.filter((net) => Ch4Logic.isTrustworthy(net.cert, reference).trustworthy);
    assert.equal(genuine.length, 1);
    assert.equal(genuine[0].kind, KIND.RENEWED);
  }
});

test('createRounds ist mit gleichem Seed deterministisch, mit anderem Seed verschieden', () => {
  const a = Ch4Logic.createRounds(CAMPUS, makeTestRng(7));
  const b = Ch4Logic.createRounds(CAMPUS, makeTestRng(7));
  assert.deepEqual(a, b);
  const others = SEEDS.map((seed) => JSON.stringify(Ch4Logic.createRounds(CAMPUS, makeTestRng(seed))));
  assert.ok(new Set(others).size > 1, 'verschiedene Seeds ergeben verschiedene Pläne');
});

// ---------------------------------------------------------------------------
// Spielablauf (Ch4Logic.Game)
// ---------------------------------------------------------------------------

test('Game: perfektes Spiel → Kapitel geschafft, perfekt (Grundlage für CERT_INSPECTOR)', () => {
  const game = newGame(7);
  assert.equal(game.getRoundNumber(), 1);
  assert.equal(game.isFinale(), false);
  assert.equal(game.isPerfect(), false, 'ohne Entscheidung noch nicht perfekt');
  const { results } = playThrough(
    game,
    (g, index) => correctDecision(g, index),
    (g) => {
      g.markNewsRead();
      const order = g.getNetworks().map((net, index) => [index, net.trustworthy ? DECISION.TRUST : DECISION.REJECT]);
      // Fälschungen zuerst ablehnen, dann dem echten vertrauen
      return order.sort((x, y) => (x[1] === DECISION.TRUST) - (y[1] === DECISION.TRUST));
    }
  );
  assert.ok(results.every((result) => result.correct), 'alle Entscheidungen richtig');
  const last = results[results.length - 1];
  assert.equal(last.outcome, OUTCOME.CONNECTED);
  assert.equal(last.chapterComplete, true);
  assert.equal(game.isPerfect(), true);
  const stats = game.getStats();
  assert.equal(stats.mistakes, 0);
  assert.equal(stats.phishCount, 0);
  assert.equal(stats.newsRead, true);
  assert.equal(stats.perfect, true);
  assert.equal(game.advance(), null, 'nach dem Finale gibt es keine Runde mehr');
  assert.equal(game.decide(0, DECISION.TRUST), null, 'nach dem Ende werden Entscheidungen ignoriert');
});

test('Game: in automatischen Runden ist nur das angewählte Netz prüfbar; advance erst nach Entscheidung', () => {
  const game = newGame(3);
  const featured = featuredIndex(game);
  game.getNetworks().forEach((net, index) => assert.equal(game.canInspect(index), index === featured));
  assert.equal(game.decide(featured === 0 ? 1 : 0, DECISION.REJECT), null, 'anderes Netz wird ignoriert');
  assert.equal(game.decide(featured, 'vielleicht'), null, 'unbekannte Entscheidung wird ignoriert');
  assert.equal(game.decide(99, DECISION.REJECT), null, 'ungültiger Index wird ignoriert');
  assert.equal(game.advance(), null, 'Runde noch nicht entschieden');
  const result = game.decide(featured, DECISION.REJECT);
  assert.equal(result.outcome, OUTCOME.CAUGHT, 'Runde 1 ist immer eine Fälschung');
  assert.equal(game.getNetworks()[featured].status, STATUS.CAUGHT);
  assert.equal(game.canInspect(featured), false);
  assert.equal(game.advance(), 2);
  assert.equal(game.getRoundNumber(), 2);
});

test('Game: Evil Twin vertraut → gephisht; erster Phish markiert; im Finale wird das Netz gesperrt', () => {
  const game = newGame(7);
  const first = game.decide(featuredIndex(game), DECISION.TRUST);
  assert.equal(first.outcome, OUTCOME.PHISHED);
  assert.equal(first.isFirstPhish, true);
  assert.equal(first.correct, false);
  assert.equal(first.roundComplete, true);
  assert.ok(first.verdict.reasons.length > 0);
  const penalty = Ch4Logic.getPenalty(first);
  assert.equal(penalty.frustration, CONFIG.FRUSTRATION.LARGE, 'großer Frust beim ersten Phish');
  assert.equal(penalty.minutes, CONFIG.PENALTY_MINUTES.LARGE, 'Passwort ändern kostet Zeit');

  while (!game.isFinale()) {
    game.decide(featuredIndex(game), correctDecision(game, featuredIndex(game)));
    game.advance();
  }
  const copy = indexOfKind(game, KIND.COPY);
  const second = game.decide(copy, DECISION.TRUST);
  assert.equal(second.outcome, OUTCOME.PHISHED);
  assert.equal(second.isFirstPhish, false);
  assert.equal(second.roundComplete, false, 'Finale geht weiter');
  assert.equal(game.getNetworks()[copy].status, STATUS.PHISHED);
  assert.equal(game.canInspect(copy), false, 'Kevins Netz ist gesperrt');
  assert.ok(Ch4Logic.getPenalty(second).frustration < penalty.frustration, 'Wiederholung kostet weniger');
  assert.equal(game.getStats().phishCount, 2);
});

test('Game: echtes Netz im Finale abgelehnt → paranoid, bleibt wählbar, Tipps eskalieren bis zur Rundmail', () => {
  const game = newGame(42);
  while (!game.isFinale()) {
    game.decide(featuredIndex(game), correctDecision(game, featuredIndex(game)));
    game.advance();
  }
  const renewed = indexOfKind(game, KIND.RENEWED);
  const levels = [];
  for (let i = 0; i < 4; i += 1) {
    const result = game.decide(renewed, DECISION.REJECT);
    assert.equal(result.outcome, OUTCOME.PARANOID);
    assert.equal(result.roundComplete, false);
    assert.equal(game.getNetworks()[renewed].status, STATUS.REJECTED);
    assert.equal(game.canInspect(renewed), true, 'abgelehntes echtes Netz bleibt wählbar (keine Sackgasse)');
    levels.push(result.hintLevel);
  }
  assert.deepEqual(levels, [1, 2, 3, 3]);
  const tips = [1, 2, 3].map((level) => Ch4Logic.describeResult({ ...game.decide(renewed, DECISION.REJECT), hintLevel: level }).tip);
  assert.match(tips[0], /Rundmail/);
  const prefix = Ch4Logic.formatFingerprintRows(Ch4Logic.RENEWAL.sha256)[0].split(':').slice(0, 4).join(':');
  assert.ok(tips[1].includes(prefix), `Tipp 2 nennt den neuen Fingerabdruck (${prefix})`);
  assert.ok(tips[2].includes(prefix));
  const done = game.decide(renewed, DECISION.TRUST);
  assert.equal(done.outcome, OUTCOME.CONNECTED);
  assert.equal(done.chapterComplete, true);
  assert.equal(game.isPerfect(), false);
});

test('Game: alle drei im Finale abgelehnt → allRejected, etwas mehr Frust, weiter spielbar', () => {
  const game = newGame(99);
  while (!game.isFinale()) {
    game.decide(featuredIndex(game), correctDecision(game, featuredIndex(game)));
    game.advance();
  }
  const fakes = game.getNetworks().map((net, index) => (net.trustworthy ? -1 : index)).filter((i) => i >= 0);
  fakes.forEach((index) => assert.equal(game.decide(index, DECISION.REJECT).outcome, OUTCOME.CAUGHT));
  const renewed = indexOfKind(game, KIND.RENEWED);
  const result = game.decide(renewed, DECISION.REJECT);
  assert.equal(result.allRejected, true);
  assert.equal(
    Ch4Logic.getPenalty(result).frustration,
    Ch4Logic.BALANCE.PARANOID_FRUSTRATION + Ch4Logic.BALANCE.ALL_REJECTED_FRUSTRATION
  );
  assert.match(Ch4Logic.describeResult(result).lines.join(' '), /ohne Netz/);
  assert.equal(game.canInspect(renewed), true);
});

test('Game: Countdown-Vertrauen zählt nicht als Urteil – auch beim echten Netz (kein CERT_INSPECTOR)', () => {
  const game = newGame(7);
  playThrough(
    game,
    (g, index) => {
      const net = g.getNetworks()[index];
      return net.trustworthy ? DECISION.TRUST : DECISION.REJECT;
    },
    (g) => [[indexOfKind(g, KIND.RENEWED), DECISION.TRUST]]
  );
  assert.equal(game.isPerfect(), true, 'Kontrolle: so wäre es perfekt');

  const auto = newGame(7);
  while (!auto.isFinale()) {
    const index = featuredIndex(auto);
    const isGenuine = auto.getNetworks()[index].trustworthy;
    const result = auto.decide(index, isGenuine ? DECISION.TRUST : DECISION.REJECT, { auto: isGenuine });
    if (isGenuine) {
      assert.equal(result.outcome, OUTCOME.CONNECTED);
      assert.equal(result.auto, true);
      assert.equal(result.correct, false, 'automatisch vertraut ist kein Urteil');
      assert.match(Ch4Logic.describeResult(result).lines.join(' '), /Countdown/);
    }
    auto.advance();
  }
  auto.decide(indexOfKind(auto, KIND.RENEWED), DECISION.TRUST);
  assert.equal(auto.isFinished(), true);
  assert.equal(auto.getStats().autoTrusts, 1);
  assert.equal(auto.isPerfect(), false);
});

test('Game: Ablehnen kann nie „automatisch“ passieren', () => {
  const game = newGame(7);
  const result = game.decide(featuredIndex(game), DECISION.REJECT, { auto: true });
  assert.equal(result.auto, false);
  assert.equal(result.correct, true);
});

test('Game: keine Sackgasse – auch wer alles falsch macht, kommt ans Ziel', () => {
  for (const seed of SEEDS) {
    const game = newGame(seed);
    let steps = 0;
    while (!game.isFinished() && steps < 40) {
      steps += 1;
      if (game.isRoundComplete()) {
        game.advance();
        continue;
      }
      const options = game.getNetworks().map((net, index) => ({ net, index })).filter(({ index }) => game.canInspect(index));
      assert.ok(options.length > 0, `Seed ${seed}: kein prüfbares Netz mehr (Sackgasse)`);
      // Immer falsch: Fälschungen vertrauen, das echte Netz ablehnen – bis nur noch das echte übrig ist
      const fake = options.find(({ net }) => !net.trustworthy);
      if (fake) game.decide(fake.index, DECISION.TRUST);
      else if (game.getStats().finaleParanoidCount < 3) game.decide(options[0].index, DECISION.REJECT);
      else game.decide(options[0].index, DECISION.TRUST);
    }
    assert.equal(game.isFinished(), true, `Seed ${seed}: nach ${steps} Schritten nicht fertig`);
  }
});

test('Game: Hinweis-Stufen bei wiederholtem Phishing (Mitleids-Tipp ab dem 2., Lupe ab dem 3.)', () => {
  const game = newGame(7);
  assert.equal(game.getPhishHintLevel(), 0);
  const levels = [];
  while (!game.isFinale()) {
    const index = featuredIndex(game);
    if (!game.getNetworks()[index].trustworthy) {
      const result = game.decide(index, DECISION.TRUST);
      levels.push(result.phishHintLevel);
    } else {
      game.decide(index, DECISION.TRUST);
    }
    game.advance();
  }
  assert.deepEqual(levels, [0, 1, 2]);
  assert.match(Ch4Logic.describeResult({ outcome: OUTCOME.PHISHED, phishHintLevel: 1, verdict: { reasons: ['x'] }, kind: KIND.COPY }).tip, /Details/);
});

test('Game: angezeigte Gründe verraten die Rundmail erst, wenn sie gelesen wurde (Plot-Twist bleibt)', () => {
  const before = newGame(7);
  const unread = before.decide(featuredIndex(before), DECISION.REJECT);
  const shown = Ch4Logic.describeResult(unread).lines.join(' ');
  assert.ok(!/Rundmail/.test(shown), `vor dem Lesen kein Hinweis auf die Rundmail: ${shown}`);
  assert.match(shown, /Ausdruck der IT-Seite/);
  assert.ok(unread.verdict.codes.includes(CODE.FINGERPRINT), 'Wahrheit bleibt unverändert');

  const after = newGame(7);
  after.markNewsRead();
  const read = after.decide(featuredIndex(after), DECISION.REJECT);
  assert.deepEqual(read.displayReasons, read.verdict.reasons);
  assert.match(Ch4Logic.describeResult(read).lines.join(' '), /Rundmail/);
});

test('Game: Rundmail-Merker, Statistik und Rundenergebnisse für die Fortschrittsanzeige', () => {
  const game = newGame(2026);
  assert.equal(game.hasReadNews(), false);
  game.markNewsRead();
  assert.equal(game.hasReadNews(), true);
  assert.deepEqual(game.getRoundResults(), ['current', 'pending', 'pending', 'pending', 'pending']);
  game.decide(featuredIndex(game), DECISION.TRUST); // Phish in Runde 1
  game.advance();
  assert.deepEqual(game.getRoundResults().slice(0, 2), ['bad', 'current']);
  game.decide(featuredIndex(game), correctDecision(game, featuredIndex(game)));
  game.advance();
  assert.equal(game.getRoundResults()[1], 'good');
  const stats = game.getStats();
  assert.equal(stats.decisions, 2);
  assert.equal(stats.mistakes, 1);
  assert.equal(stats.roundNumber, 3);
});

test('Game.compareForDisplay vergleicht wie die Lupe: Ausdruck, Rundmail erst nach dem Lesen', () => {
  const game = newGame(7);
  while (!game.isFinale()) {
    game.decide(featuredIndex(game), correctDecision(game, featuredIndex(game)));
    game.advance();
  }
  const renewed = indexOfKind(game, KIND.RENEWED);
  assert.equal(game.compareForDisplay(renewed).sha256, false, 'ohne Rundmail passt der neue Fingerabdruck nicht');
  game.markNewsRead();
  assert.equal(game.compareForDisplay(renewed).sha256, true);
  const copy = indexOfKind(game, KIND.COPY);
  const fields = game.compareForDisplay(copy);
  assert.equal(fields.serverName, true);
  assert.equal(fields.sha256, false);
});

test('Game.compareFingerprintRows markiert genau die Zeilen mit Abweichungen (Lupe)', () => {
  const game = newGame(7);
  while (!game.isFinale()) {
    game.decide(featuredIndex(game), correctDecision(game, featuredIndex(game)));
    game.advance();
  }
  const copy = indexOfKind(game, KIND.COPY);
  const cert = game.getNetworks()[copy].cert;
  const diff = Ch4Logic.diffFingerprintGroups(cert.sha256, CAMPUS.certificate.sha256);
  const expected = [0, 1, 2, 3].map((row) => !diff.some((i) => Math.floor(i / 8) === row));
  assert.deepEqual(game.compareFingerprintRows(copy), expected);
  assert.ok(expected.includes(false));

  const renewed = indexOfKind(game, KIND.RENEWED);
  assert.ok(game.compareFingerprintRows(renewed).includes(false), 'ohne Rundmail: neuer Fingerabdruck weicht ab');
  game.markNewsRead();
  assert.deepEqual(game.compareFingerprintRows(renewed), [true, true, true, true]);
  assert.equal(Ch4Logic.TEXTS.dialog.labels.validity, 'Gültigkeit');
});

// ---------------------------------------------------------------------------
// Balance, Texte, Reinheit
// ---------------------------------------------------------------------------

test('Balance kommt aus CONFIG; Frust-Budget laut Vertrag (perfekt ≤ 4, vernünftig 8–12, schludrig 25–35)', () => {
  const B = Ch4Logic.BALANCE;
  assert.equal(B.PHISH_FIRST_FRUSTRATION, CONFIG.FRUSTRATION.LARGE);
  assert.equal(B.PHISH_FIRST_MINUTES, CONFIG.PENALTY_MINUTES.LARGE);
  assert.equal(B.PARANOID_FRUSTRATION, CONFIG.FRUSTRATION.SMALL);
  assert.equal(B.PARANOID_MINUTES, CONFIG.PENALTY_MINUTES.SMALL);
  assert.equal(B.MAGNIFIER_MINUTES, CONFIG.PENALTY_MINUTES.SMALL);

  const finaleCorrect = (g) => {
    const renewed = indexOfKind(g, KIND.RENEWED);
    return [[renewed, DECISION.TRUST]];
  };
  const perfect = playThrough(newGame(7), (g, i) => correctDecision(g, i), finaleCorrect);
  assert.ok(perfect.frustration <= 4, `perfekt: ${perfect.frustration}`);

  // Vernünftig: alles richtig, aber im Finale ohne Rundmail erst alles abgelehnt
  const reasonable = playThrough(newGame(7), (g, i) => correctDecision(g, i), (g) => {
    const moves = g.getNetworks().map((net, index) => [index, DECISION.REJECT]);
    moves.sort((x, y) => (g.getNetworks()[x[0]].trustworthy ? 1 : 0) - (g.getNetworks()[y[0]].trustworthy ? 1 : 0));
    return [...moves, [indexOfKind(g, KIND.RENEWED), DECISION.TRUST]];
  });
  assert.ok(reasonable.frustration >= 8 && reasonable.frustration <= 12, `vernünftig: ${reasonable.frustration}`);

  // Schludrig: einmal gephisht, im Finale der Kopie vertraut und das echte einmal abgelehnt
  const sloppy = playThrough(
    newGame(7),
    (g, i, round) => (round === 1 ? DECISION.TRUST : correctDecision(g, i)),
    (g) => [
      [indexOfKind(g, KIND.COPY), DECISION.TRUST],
      [indexOfKind(g, KIND.RENEWED), DECISION.REJECT],
      [indexOfKind(g, KIND.RENEWED), DECISION.TRUST],
    ]
  );
  assert.ok(sloppy.frustration >= 25 && sloppy.frustration <= 35, `schludrig: ${sloppy.frustration}`);
});

test('describeResult liefert deutsche Titel, Zeilen und Kevin-Sprüche für alle Ergebnisse', () => {
  const game = newGame(7);
  const caught = game.decide(featuredIndex(game), DECISION.REJECT);
  const text = Ch4Logic.describeResult(caught);
  assert.equal(text.tone, 'success');
  assert.match(text.title, /Kevin/);
  assert.ok(text.lines.length >= 2 && text.lines.length <= 5);
  assert.ok(text.kevin && text.kevin.startsWith('Kevin'));

  const phished = Ch4Logic.describeResult({ outcome: OUTCOME.PHISHED, isFirstPhish: true, kind: KIND.TYPO, verdict: { reasons: ['Servername falsch.'] } });
  assert.equal(phished.tone, 'error');
  assert.match(phished.lines.join(' '), /PEAP\/MSCHAPv2/);
  assert.match(phished.lines.join(' '), /Passwort/);
  assert.match(phished.button, /Passwort ändern/);

  const paranoidAuto = Ch4Logic.describeResult({ outcome: OUTCOME.PARANOID, isFinale: false, kind: KIND.GENUINE, verdict: { reasons: [] } });
  assert.match(paranoidAuto.title, /echte/);
  const connected = Ch4Logic.describeResult({ outcome: OUTCOME.CONNECTED, isFinale: false, kind: KIND.GENUINE, verdict: { reasons: [] } });
  assert.match(connected.lines.join(' '), /Deauth/);
  const final = Ch4Logic.describeFinal({ perfect: true, phishCount: 0 });
  assert.match(final.lines.join(' '), /Domain/);
  assert.ok(final.lines.some((line) => /easyroam/.test(line)));
  assert.match(Ch4Logic.describeFinal({ perfect: false, phishCount: 2 }).lines.join(' '), /2×/);

  for (const kind of [KIND.COPY, KIND.HOMOGLYPH]) {
    const copyText = Ch4Logic.describeResult({ outcome: OUTCOME.CAUGHT, kind, verdict: { reasons: ['Fingerabdruck falsch.'] } });
    assert.match(copyText.lines.join(' '), /abschreiben/, `Kernbotschaft bei ${kind}`);
  }
  for (const kind of FAKE_KINDS) assert.ok(Ch4Logic.TEXTS.kevin[kind], `Kevin-Spruch für ${kind}`);
  const all = JSON.stringify(Ch4Logic.TEXTS);
  assert.ok(!/\b(ae|oe|ue)\b/.test(all), 'keine Umlaut-Umschreibungen');
});

test('HUD-Aufgaben sind kurz genug (≤ 40 Zeichen), damit das HUD sie nicht kürzt', () => {
  const objectives = Ch4Logic.TEXTS.objectives;
  for (const [key, value] of Object.entries(objectives)) {
    const text = typeof value === 'function' ? value(Ch4Logic.ROUND_COUNT) : value;
    assert.ok(text.length <= 40, `${key}: „${text}“ hat ${text.length} Zeichen`);
  }
});

test('Runden-Toasts bleiben einzeilig (≤ 66 Zeichen) und nennen den Ort', () => {
  for (const seed of SEEDS) {
    Ch4Logic.createRounds(CAMPUS, makeTestRng(seed)).forEach((round) => {
      assert.ok(round.toast.length <= 66, `Runde ${round.number}: „${round.toast}“ hat ${round.toast.length} Zeichen`);
      assert.ok(round.toast.endsWith(round.intro), 'Toast enthält die Einleitung');
      assert.ok(round.place.startsWith(round.toast.split(':')[0]), 'Toast beginnt mit (kurzem) Ort');
    });
  }
});

test('Texte und Rundenorte nutzen CAMPUS statt harter Werte', () => {
  const rounds = Ch4Logic.createRounds(CAMPUS, makeTestRng(1));
  assert.ok(rounds[0].place.includes(CAMPUS.lectureBuilding));
  assert.ok(rounds[4].place.includes(CAMPUS.lectureRoom));
  const sheet = Ch4Logic.TEXTS.sheet;
  assert.ok(sheet.footer(CAMPUS).includes('03/2026'), 'Stand aus validFrom abgeleitet');
  const news = Ch4Logic.TEXTS.news.certItem(CAMPUS);
  assert.ok(news.includes(CAMPUS.certificate.serverName));
  const others = Ch4Logic.TEXTS.otherNetworks(CAMPUS);
  assert.ok(others.some((net) => net.ssid === CAMPUS.wifi.guestSsid));
  others.forEach((net) => assert.ok(net.toast.length > 0));
});

test('Reinheit: kein Phaser, window, document oder Math.random im Code der Logik', () => {
  const source = fs.readFileSync(path.join(ROOT, LOGIC_FILE), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
  for (const pattern of [/\bPhaser\b/, /\bwindow\b/, /\bdocument\b/, /Math\.random/, /\bsetTimeout\b/]) {
    assert.ok(!pattern.test(code), `verboten: ${pattern}`);
  }
  assert.match(source, /^\/\*\*/, 'Kopfkommentar vorhanden');
});

test('mit dem echten RNG aus dem Kern: deterministisch je Seed, vollständig spielbar', { skip: !REAL_RNG && 'src/core/rng.js fehlt' }, () => {
  REAL_RNG.seed(7);
  const a = Ch4Logic.createRounds(CAMPUS, REAL_RNG);
  REAL_RNG.seed(7);
  const b = Ch4Logic.createRounds(CAMPUS, REAL_RNG);
  assert.deepEqual(a, b);
  for (const seed of SEEDS) {
    // Game ohne rng-Option nimmt das globale RNG (wie im Spiel)
    REAL_RNG.seed(seed);
    const perfect = new Ch4Logic.Game({ campus: CAMPUS });
    assert.equal(perfect.getRound().networks.length, 3);
    playThrough(perfect, (g, i) => correctDecision(g, i), (g) => {
      g.markNewsRead();
      return g.getNetworks()
        .map((net, index) => [index, net.trustworthy ? DECISION.TRUST : DECISION.REJECT])
        .sort((x, y) => (x[1] === DECISION.TRUST) - (y[1] === DECISION.TRUST));
    });
    assert.equal(perfect.isPerfect(), true, `Seed ${seed}: perfekt spielbar`);
    const finale = perfect.rounds[4].networks.filter((net) => Ch4Logic.isTrustworthy(net.cert, perfect.reference).trustworthy);
    assert.equal(finale.length, 1, `Seed ${seed}: genau ein echtes Netz im Finale`);
  }
});
