/**
 * ch1.test.js – Unit-Tests für Kapitel 1 „Die Registrierung“ (src/logic/ch1Registration.js).
 *
 * Prüft die reine Kapitel-Logik ohne Phaser: Login mit verwechselbaren Zeichen, Lupe,
 * Mitleids-Tipps, CAPTCHA (erster Versuch scheitert immer), Nutzungsordnung mit Geheimwort,
 * Passwort-Regeln im „Password Game“-Prinzip (nacheinander, lösbar), Synchronisation,
 * Ladezeiten über EDGE und das Frust-Budget laut Vertrag (Abschnitt 6).
 * Zufall kommt über ein injiziertes RNG (Fake-RNG hier, echtes RNG falls schon gebaut).
 * Aufruf: node --test "tests/unit/ch1.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadScripts, CORE_LOGIC_FILES, ROOT } = require('./_load.js');

const LOGIC_FILE = 'src/logic/ch1Registration.js';
const { CONFIG, CAMPUS, Ch1Logic } = loadScripts([...CORE_LOGIC_FILES, LOGIC_FILE], ['CONFIG', 'CAMPUS', 'Ch1Logic']);

/** true, sobald src/core/rng.js kein Platzhalter mehr ist. */
const HAS_REAL_RNG = vm.runInThisContext("typeof RNG !== 'undefined' && typeof RNG.seed === 'function'");

/** Kleines, seedbares Ersatz-RNG mit der Vertrags-Schnittstelle (mulberry32). */
function makeRng(seed = 1) {
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
    pick: (array) => array[Math.floor(next() * array.length)],
    shuffle: (array) => {
      const copy = array.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

const RULE_IDS = ['minLength', 'digit', 'mixedCase', 'special', 'course', 'swabian', 'digitSum', 'ascii', 'maxLength'];
const VALID_PASSWORD = 'WWI26A-Brezel94';

/** IDs der Regeln, die ein Passwort verletzt. */
function failingRules(password) {
  return Ch1Logic.evaluatePassword(password, CAMPUS).results.filter((r) => !r.ok).map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Grundgerüst
// ---------------------------------------------------------------------------

test('Ch1Logic ist eingefroren und kennt die fünf Schritte in Reihenfolge', () => {
  assert.ok(Object.isFrozen(Ch1Logic));
  assert.deepEqual([...Ch1Logic.STEPS], ['login', 'captcha', 'tos', 'password', 'sync']);
  assert.ok(Object.isFrozen(Ch1Logic.BALANCE));
});

test('Logik-Datei ist rein: kein Math.random, kein Phaser, kein window/document', () => {
  const source = fs.readFileSync(path.join(ROOT, LOGIC_FILE), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.random/);
  assert.doesNotMatch(code, /\bPhaser\b/);
  assert.doesNotMatch(code, /\bwindow\./);
  assert.doesNotMatch(code, /\bdocument\./);
  assert.doesNotMatch(code, /\bsetTimeout\b|\bsetInterval\b/);
});

test('BALANCE nutzt die globalen Strafstufen aus CONFIG', () => {
  const B = Ch1Logic.BALANCE;
  assert.equal(B.LOGIN_FAIL_FRUSTRATION, CONFIG.FRUSTRATION.SMALL);
  assert.equal(B.MAGNIFIER_MINUTES, CONFIG.PENALTY_MINUTES.SMALL);
  assert.equal(B.COPIER_MINUTES, CONFIG.PENALTY_MINUTES.LARGE);
  assert.equal(B.CAPTCHA_FORCED_FRUSTRATION, CONFIG.FRUSTRATION.TINY);
  assert.equal(B.SYNC_WAIT_MINUTES, 24 * 60);
  assert.equal(B.SYNC_RELOAD_MINUTES, 1);
  assert.equal(B.SYNC_MIN_RELOADS, 3);
  assert.equal(B.SYNC_MAX_RELOADS, 6);
  assert.ok(B.PITY_AFTER_FAILS >= 2 && B.PITY_AFTER_FAILS <= 3, 'Mitleids-Tipp nach 2–3 Fehlern');
  assert.ok(B.RESCUE_AFTER_FAILS > B.PITY_AFTER_FAILS);
});

test('Frust-Budget: vernünftig ca. 8–12 %, schludrig 25–35 % (Vertrag Abschnitt 6)', () => {
  const B = Ch1Logic.BALANCE;
  // Vernünftig: 1 Login-Fehler, Pflicht-Fehlschlag beim CAPTCHA, eine Regel-Überraschung, ein Sync-Rückschlag
  const reasonable = B.LOGIN_FAIL_FRUSTRATION + B.CAPTCHA_FORCED_FRUSTRATION
    + B.PASSWORD_TWIST_FRUSTRATION + B.SYNC_SETBACK_FRUSTRATION;
  // Schludrig: 3 Login-Fehler, 2 CAPTCHA-Fehler, 2 Überraschungen, 1× Wiederholung falsch
  const sloppy = 3 * B.LOGIN_FAIL_FRUSTRATION + B.CAPTCHA_FORCED_FRUSTRATION + 2 * B.CAPTCHA_ERROR_FRUSTRATION
    + 2 * B.PASSWORD_TWIST_FRUSTRATION + B.CONFIRM_FAIL_FRUSTRATION + B.SYNC_SETBACK_FRUSTRATION;
  assert.ok(reasonable >= 8 && reasonable <= 12, `vernünftig: ${reasonable} %`);
  assert.ok(sloppy >= 25 && sloppy <= 35, `schludrig: ${sloppy} %`);
});

// ---------------------------------------------------------------------------
// Schritt 1: Login
// ---------------------------------------------------------------------------

test('checkLogin: richtige Kennung + Initialpasswort → ok', () => {
  const result = Ch1Logic.checkLogin(CAMPUS.username, CAMPUS.initialPassword, CAMPUS);
  assert.equal(result.ok, true);
  assert.equal(result.code, 'OK');
});

test('checkLogin: Kennung ist großzügig (Leerzeichen außen, Großbuchstaben)', () => {
  const result = Ch1Logic.checkLogin(`  ${CAMPUS.username.toUpperCase()} `, CAMPUS.initialPassword, CAMPUS);
  assert.equal(result.ok, true);
});

test('checkLogin: leere Felder', () => {
  assert.equal(Ch1Logic.checkLogin('', CAMPUS.initialPassword, CAMPUS).code, 'EMPTY_USERNAME');
  assert.equal(Ch1Logic.checkLogin(CAMPUS.username, '', CAMPUS).code, 'EMPTY_PASSWORD');
  assert.equal(Ch1Logic.checkLogin('', '', CAMPUS).field, 'username');
});

test('checkLogin: Kennung mit Realm wird erkannt (Lerneffekt Kennung ≠ Identität)', () => {
  const result = Ch1Logic.checkLogin(CAMPUS.identity, CAMPUS.initialPassword, CAMPUS);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'REALM_IN_USERNAME');
  assert.equal(result.field, 'username');
  assert.ok(result.hint.includes(CAMPUS.username));
});

test('checkLogin: unbekannte Kennung', () => {
  const result = Ch1Logic.checkLogin('wwi26043', CAMPUS.initialPassword, CAMPUS);
  assert.equal(result.code, 'UNKNOWN_USER');
  assert.equal(result.field, 'username');
});

test('checkLogin: verwechselte Zeichen I/l/1 bzw. O/0 → CONFUSABLE mit Positionen', () => {
  const pw = CAMPUS.initialPassword; // 'Il1O0-Kx7#q'
  const swapped = 'lI1O0' + pw.slice(5);
  const result = Ch1Logic.checkLogin(CAMPUS.username, swapped, CAMPUS);
  assert.equal(result.code, 'CONFUSABLE');
  assert.equal(result.field, 'password');
  assert.deepEqual(result.wrongPositions, [0, 1]);
  const zeroes = 'Il1' + '00' + pw.slice(5);
  assert.equal(Ch1Logic.checkLogin(CAMPUS.username, zeroes, CAMPUS).code, 'CONFUSABLE');
});

test('checkLogin: nur Groß-/Kleinschreibung falsch → CASE; Leerzeichen → WHITESPACE; sonst WRONG_PASSWORD', () => {
  const pw = CAMPUS.initialPassword;
  assert.equal(Ch1Logic.checkLogin(CAMPUS.username, pw.slice(0, 6) + pw.slice(6).toLowerCase(), CAMPUS).code, 'CASE');
  assert.equal(Ch1Logic.checkLogin(CAMPUS.username, `${pw} `, CAMPUS).code, 'WHITESPACE');
  assert.equal(Ch1Logic.checkLogin(CAMPUS.username, 'hunter2', CAMPUS).code, 'WRONG_PASSWORD');
});

test('checkLogin: Systemmeldung bleibt vage (gleich für Kennung und Passwort), Tipp ist konkret', () => {
  const unknown = Ch1Logic.checkLogin('xyz', CAMPUS.initialPassword, CAMPUS);
  const wrong = Ch1Logic.checkLogin(CAMPUS.username, 'falsch', CAMPUS);
  assert.equal(unknown.message, wrong.message, 'vage Meldung verrät nicht, was falsch ist');
  for (const r of [unknown, wrong]) {
    assert.ok(r.message.length > 0);
    assert.ok(r.hint.length > 0 && r.hint !== r.message);
  }
});

test('magnifyPassword: markiert genau I, l, 1, O, 0 als verwechselbar, mit Buchstabiertafel', () => {
  const cells = Ch1Logic.magnifyPassword(CAMPUS.initialPassword);
  assert.equal(cells.length, [...CAMPUS.initialPassword].length);
  const confusable = cells.filter((c) => c.isConfusable).map((c) => c.char).join('');
  assert.equal(confusable, 'Il1O0');
  const byChar = Object.fromEntries(cells.filter((c) => c.isConfusable).map((c) => [c.char, c.label]));
  assert.match(byChar.I, /groß/i);
  assert.match(byChar.l, /klein/i);
  assert.match(byChar['1'], /Eins/);
  assert.match(byChar.O, /groß/i);
  assert.match(byChar['0'], /Null/);
  assert.equal(new Set(Object.values(byChar)).size, 5, 'Beschriftungen eindeutig');
  assert.ok(cells.filter((c) => !c.isConfusable).every((c) => c.label === null));
});

test('loginTip: konkret ab dem ersten Fehler, buchstabiert ab PITY, Kopierer ab RESCUE', () => {
  const B = Ch1Logic.BALANCE;
  const first = Ch1Logic.loginTip(1, 'CONFUSABLE', CAMPUS);
  assert.match(first, /Lupe/);
  const pity = Ch1Logic.loginTip(B.PITY_AFTER_FAILS, 'CONFUSABLE', CAMPUS);
  assert.match(pity, /Null/);
  assert.match(pity, /Eins/);
  const rescue = Ch1Logic.loginTip(B.RESCUE_AFTER_FAILS, 'WRONG_PASSWORD', CAMPUS);
  assert.match(rescue, /Kopierer/);
  const user = Ch1Logic.loginTip(1, 'UNKNOWN_USER', CAMPUS);
  assert.ok(user.includes(CAMPUS.username));
  const realm = Ch1Logic.loginTip(1, 'REALM_IN_USERNAME', CAMPUS);
  assert.ok(realm.includes(CAMPUS.username));
});

// ---------------------------------------------------------------------------
// Schritt 2: CAPTCHA
// ---------------------------------------------------------------------------

test('createCaptchaGrid: 9 Kacheln, 3–4 Access Points, mindestens 2 Rauchmelder', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const grid = Ch1Logic.createCaptchaGrid(makeRng(seed));
    assert.equal(grid.tiles.length, 9);
    const targets = grid.tiles.map((t, i) => (t.isTarget ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(grid.targets, targets);
    assert.ok(targets.length >= 3 && targets.length <= 4, `Seed ${seed}: ${targets.length} Ziele`);
    assert.ok(grid.tiles.filter((t) => t.kind === 'smokeDetector').length >= 2);
    assert.ok(grid.tiles.some((t) => t.kind === 'apCeiling'), 'mindestens ein Decken-AP (Rauchmelder-Zwilling)');
    for (const tile of grid.tiles) {
      const kind = Ch1Logic.CAPTCHA_KINDS[tile.kind];
      assert.ok(kind, `Art ${tile.kind} bekannt`);
      assert.equal(tile.isTarget, kind.isTarget);
      assert.ok(typeof tile.label === 'string' && tile.label.length > 0);
    }
  }
});

test('createCaptchaGrid: deterministisch bei gleichem Seed', () => {
  const a = Ch1Logic.createCaptchaGrid(makeRng(7));
  const b = Ch1Logic.createCaptchaGrid(makeRng(7));
  assert.deepEqual(a, b);
});

test('CAPTCHA_KINDS: nur Access Points und Router sind Ziele', () => {
  const targets = Object.entries(Ch1Logic.CAPTCHA_KINDS).filter(([, k]) => k.isTarget).map(([id]) => id).sort();
  assert.deepEqual(targets, ['apCeiling', 'apRouter']);
});

test('checkCaptcha: korrekt, fehlende und falsche Auswahl', () => {
  const grid = Ch1Logic.createCaptchaGrid(makeRng(3));
  assert.equal(Ch1Logic.checkCaptcha(grid, grid.targets).isCorrect, true);
  assert.equal(Ch1Logic.checkCaptcha(grid, new Set(grid.targets)).isCorrect, true, 'Set erlaubt');
  const missing = Ch1Logic.checkCaptcha(grid, grid.targets.slice(1));
  assert.equal(missing.isCorrect, false);
  assert.deepEqual(missing.missed, [grid.targets[0]]);
  const decoy = grid.tiles.findIndex((t) => !t.isTarget);
  const extra = Ch1Logic.checkCaptcha(grid, [...grid.targets, decoy]);
  assert.equal(extra.isCorrect, false);
  assert.deepEqual(extra.wrong, [decoy]);
});

test('captchaOutcome: Runde 1 scheitert immer, ab Runde 2 zählt die Auswahl', () => {
  assert.deepEqual(Ch1Logic.captchaOutcome(1, true), { passed: false, isForced: true, isPlayerError: false });
  assert.deepEqual(Ch1Logic.captchaOutcome(1, false), { passed: false, isForced: true, isPlayerError: true });
  assert.deepEqual(Ch1Logic.captchaOutcome(2, true), { passed: true, isForced: false, isPlayerError: false });
  assert.deepEqual(Ch1Logic.captchaOutcome(2, false), { passed: false, isForced: false, isPlayerError: true });
});

test('captchaTip: nach Pflicht-Fehlschlag beruhigend, ab PITY beschreibend, ab RESCUE Bildbeschreibungen', () => {
  const B = Ch1Logic.BALANCE;
  assert.match(Ch1Logic.captchaTip(0, true), /erste Versuch/);
  assert.match(Ch1Logic.captchaTip(B.PITY_AFTER_FAILS, false), /Rauchmelder/);
  assert.match(Ch1Logic.captchaTip(B.CAPTCHA_LABELS_AFTER_ERRORS, false), /Bildbeschreibung/);
  assert.ok(Ch1Logic.shouldShowCaptchaLabels(B.CAPTCHA_LABELS_AFTER_ERRORS));
  assert.ok(!Ch1Logic.shouldShowCaptchaLabels(B.CAPTCHA_LABELS_AFTER_ERRORS - 1));
});

// ---------------------------------------------------------------------------
// Schritt 3: Nutzungsordnung
// ---------------------------------------------------------------------------

test('pickSecretWord: schwäbisches Wort ohne Umlaute aus CAMPUS, deterministisch', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const word = Ch1Logic.pickSecretWord(makeRng(seed), CAMPUS);
    assert.ok(CAMPUS.flavor.swabianWords.includes(word));
    assert.match(word, /^[A-Za-z]+$/);
  }
  assert.equal(Ch1Logic.pickSecretWord(makeRng(5), CAMPUS), Ch1Logic.pickSecretWord(makeRng(5), CAMPUS));
});

test('buildTerms: absurd lang, Geheimwort genau einmal und gut versteckt (nicht vorne)', () => {
  const secret = 'Muggeseggele';
  const terms = Ch1Logic.buildTerms(secret, CAMPUS);
  assert.ok(terms.length >= 3000, `Länge ${terms.length}`);
  assert.equal(terms.split(secret).length - 1, 1, 'Geheimwort genau einmal');
  assert.ok(terms.indexOf(secret) > terms.length * 0.4, 'nicht in den ersten 40 %');
  assert.ok(terms.includes('§ 1'));
  assert.ok(terms.includes(CAMPUS.helpdesk.hours));
  assert.ok(terms.includes('Anmerkungen'), 'verrät das Feld für das Geheimwort');
  assert.doesNotMatch(terms, /\{[a-zA-Z]+\}/, 'keine offenen Platzhalter');
});

test('isSecretWord: großzügig bei Groß-/Kleinschreibung, Leerzeichen und Anführungszeichen', () => {
  assert.ok(Ch1Logic.isSecretWord('Muggeseggele', 'Muggeseggele'));
  assert.ok(Ch1Logic.isSecretWord('  muggeseggele ', 'Muggeseggele'));
  assert.ok(Ch1Logic.isSecretWord('„Muggeseggele“', 'Muggeseggele'));
  assert.ok(Ch1Logic.isSecretWord('"MUGGESEGGELE"', 'Muggeseggele'));
  assert.ok(!Ch1Logic.isSecretWord('Mugge', 'Muggeseggele'));
  assert.ok(!Ch1Logic.isSecretWord('', 'Muggeseggele'));
});

test('isTermsEnd: Akzeptieren erst am Ende (Schwelle aus BALANCE)', () => {
  assert.ok(!Ch1Logic.isTermsEnd(0.5));
  assert.ok(Ch1Logic.isTermsEnd(1));
  assert.ok(Ch1Logic.isTermsEnd(Ch1Logic.BALANCE.TOS_END_THRESHOLD));
  assert.ok(!Ch1Logic.isTermsEnd(NaN));
});

// ---------------------------------------------------------------------------
// Schritt 4: Passwort-Regeln
// ---------------------------------------------------------------------------

test('PASSWORD_RULES: neun Regeln in fester Reihenfolge, je mit Titel und Erklärung', () => {
  assert.deepEqual(Ch1Logic.PASSWORD_RULES.map((r) => r.id), RULE_IDS);
  for (const rule of Ch1Logic.PASSWORD_RULES) {
    assert.ok(rule.title.length > 0 && rule.title.length <= 48, `Titel zu lang: ${rule.title}`);
    assert.ok(rule.detail.length > 0 && rule.detail.length <= 80, `Erklärung zu lang: ${rule.detail}`);
  }
});

test('evaluatePassword: Beispielpasswort erfüllt alles', () => {
  const evaluation = Ch1Logic.evaluatePassword(VALID_PASSWORD, CAMPUS);
  assert.equal(evaluation.allOk, true);
  assert.equal(evaluation.firstFailingIndex, -1);
  assert.equal(evaluation.digitSum, 21);
  assert.equal(evaluation.length, VALID_PASSWORD.length);
});

test('evaluatePassword: Einzelregeln', () => {
  assert.deepEqual(failingRules(''), RULE_IDS.filter((id) => id !== 'ascii' && id !== 'maxLength'));
  assert.ok(failingRules('abcdefghi').includes('minLength'));
  assert.ok(!failingRules('abcdefghij').includes('minLength'));
  assert.ok(failingRules('abcdefghij').includes('digit'));
  assert.ok(failingRules('abcdefghi1').includes('mixedCase'));
  assert.ok(!failingRules('Abcdefghi1').includes('mixedCase'));
  assert.ok(failingRules('Abcdefghi1').includes('special'));
  assert.ok(!failingRules('Abcdefghi1!').includes('special'));
  assert.ok(failingRules('Abcdefghi1§').includes('special'), '§ zählt nicht als Sonderzeichen');
  assert.ok(!failingRules('wwi26a-x').includes('course'), 'Kurs ohne Rücksicht auf Groß-/Kleinschreibung');
  assert.ok(failingRules('WWI25A').includes('course'));
  assert.ok(!failingRules('xxSpätzlexx').includes('swabian'));
  assert.ok(!failingRules('xxSpaetzlexx').includes('swabian'), 'ä → ae zählt auch');
  assert.ok(!failingRules('xxBREZELxx').includes('swabian'));
  assert.ok(failingRules('xxBrezlxx').includes('swabian'));
  assert.ok(failingRules('Spätzle').includes('ascii'));
  assert.ok(failingRules('Straße').includes('ascii'));
  assert.ok(failingRules('Brezel 1').includes('ascii'), 'Leerzeichen verboten');
  assert.ok(!failingRules('Brezel#1').includes('ascii'));
  assert.ok(failingRules('WWI26A-Brezel-94').length === 0, '16 Zeichen sind noch erlaubt');
  assert.ok(failingRules('WWI26A-Brezel-94x').includes('maxLength'));
});

test('evaluatePassword: Quersumme zählt alle Ziffern (auch die im Kurs) und liefert Live-Status', () => {
  const evaluation = Ch1Logic.evaluatePassword('WWI26A', CAMPUS);
  assert.equal(evaluation.digitSum, 8);
  const rule = evaluation.results.find((r) => r.id === 'digitSum');
  assert.equal(rule.ok, false);
  assert.match(rule.status, /8/);
  assert.match(evaluation.results.find((r) => r.id === 'minLength').status, /6/);
});

test('evaluatePassword: Umlaute zählen als ein Zeichen', () => {
  assert.equal(Ch1Logic.evaluatePassword('äöü', CAMPUS).length, 3);
});

test('Typische Stolperfallen: langes Wort sprengt Höchstlänge, Umlaut sprengt ASCII', () => {
  assert.deepEqual(failingRules('Kehrwoche!WWI26A94'), ['maxLength']);
  assert.deepEqual(failingRules('Spätzle!WWI26A94'), ['ascii']);
});

test('revealCount: Regeln erscheinen nacheinander und verschwinden nie wieder', () => {
  let revealed = Ch1Logic.INITIAL_REVEALED;
  assert.equal(revealed, 1);
  const steps = ['', 'passwort12', 'Passwort12', 'Passwort12!', 'Passwort12!WWI26A', 'Passwort12!WWI26ABrezel'];
  const seen = [];
  for (const pw of steps) {
    revealed = Ch1Logic.revealCount(revealed, Ch1Logic.evaluatePassword(pw, CAMPUS));
    seen.push(revealed);
  }
  // '' → 1; 'passwort12' → Regel 3 (Groß/Klein) offen; … ; Brezel → Quersumme (7) offen
  assert.deepEqual(seen, [1, 3, 4, 5, 6, 7]);
  // Zurück auf leer: nichts verschwindet
  assert.equal(Ch1Logic.revealCount(revealed, Ch1Logic.evaluatePassword('', CAMPUS)), 7);
  // Alles auf einmal (Einfügen): alle neun sichtbar
  assert.equal(Ch1Logic.revealCount(1, Ch1Logic.evaluatePassword(VALID_PASSWORD, CAMPUS)), RULE_IDS.length);
});

test('newlyRevealed + isTwistRule: Überraschungsregeln erkennen', () => {
  const evaluation = Ch1Logic.evaluatePassword('Kehrwoche!WWI26A94', CAMPUS);
  const next = Ch1Logic.revealCount(7, evaluation);
  assert.equal(next, 9);
  const fresh = Ch1Logic.newlyRevealed(7, next, evaluation);
  assert.deepEqual(fresh.map((r) => r.id), ['ascii', 'maxLength']);
  const twists = fresh.filter((r) => !r.ok && Ch1Logic.isTwistRule(r.id)).map((r) => r.id);
  assert.deepEqual(twists, ['maxLength']);
  assert.ok(!Ch1Logic.isTwistRule('digit'));
});

test('isPasswordComplete: erst wenn alle Regeln sichtbar und erfüllt sind', () => {
  const ok = Ch1Logic.evaluatePassword(VALID_PASSWORD, CAMPUS);
  assert.ok(Ch1Logic.isPasswordComplete(ok, RULE_IDS.length));
  assert.ok(!Ch1Logic.isPasswordComplete(ok, RULE_IDS.length - 1));
  assert.ok(!Ch1Logic.isPasswordComplete(Ch1Logic.evaluatePassword('x', CAMPUS), RULE_IDS.length));
});

test('suggestPassword: liefert ein gültiges Passwort aus den CAMPUS-Daten', () => {
  const suggestion = Ch1Logic.suggestPassword(CAMPUS);
  assert.ok(suggestion.includes(CAMPUS.course));
  assert.deepEqual(failingRules(suggestion), []);
});

test('ruleHint: konkrete Mitleids-Tipps, die das Problem wirklich lösen', () => {
  // Quersumme: die vorgeschlagenen Ziffern anhängen → genau 21
  const base = 'Brezel!WWI26A';
  const hint = Ch1Logic.ruleHint('digitSum', base, CAMPUS);
  const quoted = hint.match(/„(\d+)“/);
  assert.ok(quoted, `Tipp nennt Ziffern: ${hint}`);
  assert.deepEqual(failingRules(base + quoted[1]), []);
  // Zu hohe Quersumme
  assert.match(Ch1Logic.ruleHint('digitSum', 'Brezel!WWI26A999', CAMPUS), /zu viel/);
  // Höchstlänge: nennt die Überlänge
  assert.match(Ch1Logic.ruleHint('maxLength', 'Kehrwoche!WWI26A94', CAMPUS), /2 Zeichen zu viel/);
  // ASCII: nennt das störende Zeichen
  assert.match(Ch1Logic.ruleHint('ascii', 'Spätzle!WWI26A94', CAMPUS), /ä/);
  // Kurs: nennt den Kurs
  assert.ok(Ch1Logic.ruleHint('course', 'x', CAMPUS).includes(CAMPUS.course));
  for (const id of RULE_IDS) {
    assert.ok(Ch1Logic.ruleHint(id, '', CAMPUS).length > 0, `Tipp für ${id}`);
  }
});

test('digitsForSum: kurze Ziffernfolge mit gewünschter Quersumme', () => {
  assert.equal(Ch1Logic.digitsForSum(13), '94');
  assert.equal(Ch1Logic.digitsForSum(4), '4');
  assert.equal(Ch1Logic.digitsForSum(18), '99');
  assert.equal(Ch1Logic.digitsForSum(0), '');
});

// ---------------------------------------------------------------------------
// Schritt 5: Synchronisation
// ---------------------------------------------------------------------------

test('createSyncPlan: 3–6 Neuladen nötig, genug Meldungen, deterministisch', () => {
  const counts = new Set();
  for (let seed = 1; seed <= 60; seed += 1) {
    const plan = Ch1Logic.createSyncPlan(makeRng(seed), CAMPUS);
    assert.ok(plan.needed >= 3 && plan.needed <= 6);
    assert.ok(plan.messages.length >= plan.needed - 1);
    counts.add(plan.needed);
  }
  assert.ok(counts.size >= 3, 'Anzahl variiert');
  assert.deepEqual(Ch1Logic.createSyncPlan(makeRng(9), CAMPUS), Ch1Logic.createSyncPlan(makeRng(9), CAMPUS));
});

test('syncStatus: Meldungen bis zum Ziel, dann erledigt; Platzhalter ersetzt', () => {
  const plan = Ch1Logic.createSyncPlan(makeRng(4), CAMPUS);
  const initial = Ch1Logic.syncStatus(plan, 0);
  assert.equal(initial.done, false);
  assert.ok(initial.text.length > 0);
  for (let reloads = 1; reloads < plan.needed; reloads += 1) {
    const status = Ch1Logic.syncStatus(plan, reloads);
    assert.equal(status.done, false);
    assert.doesNotMatch(status.text, /\{[a-zA-Z]+\}/);
  }
  assert.equal(Ch1Logic.syncStatus(plan, plan.needed).done, true);
  assert.equal(Ch1Logic.syncStatus(plan, plan.needed + 3).done, true);
  assert.ok(Ch1Logic.SYNC_MESSAGES.some((m) => m.isSetback), 'es gibt einen Rückschlag (99 % → 0 %)');
});

// ---------------------------------------------------------------------------
// Seiten, Ladezeiten, Formatierung, Texte
// ---------------------------------------------------------------------------

test('PAGES: jede Station hat Pfad, Titel und Größe; Ladezeit wächst mit der Größe, bleibt begrenzt', () => {
  const B = Ch1Logic.BALANCE;
  for (const step of Ch1Logic.STEPS) {
    const page = Ch1Logic.PAGES[step];
    assert.ok(page, `Seite ${step}`);
    assert.match(page.path, /^\//);
    assert.ok(page.title.length > 0);
    assert.ok(page.sizeKb > 0);
    const ms = Ch1Logic.loadingMs(page.sizeKb);
    assert.ok(ms >= B.LOAD_MIN_MS && ms <= B.LOAD_MAX_MS, `${step}: ${ms} ms`);
  }
  assert.ok(Ch1Logic.loadingMs(2000) > Ch1Logic.loadingMs(400));
  assert.equal(Ch1Logic.loadingMs(1e9), B.LOAD_MAX_MS);
});

test('Formatierung auf Deutsch: Megabyte mit Komma, Kilobyte mit Tausenderpunkt', () => {
  assert.equal(Ch1Logic.formatMegabytes(47.56), '47,6 MB');
  assert.equal(Ch1Logic.formatMegabytes(-3), '0,0 MB');
  assert.equal(Ch1Logic.formatKilobytes(1240), '1.240 kB');
  assert.equal(Ch1Logic.formatKilobytes(96), '96 kB');
  assert.equal(Ch1Logic.dataVolumeAfter(48, 1024), 47);
  assert.equal(Ch1Logic.dataVolumeAfter(0.5, 2048), 0);
});

test('fill ersetzt Platzhalter aus CAMPUS-Variablen, unbekannte bleiben stehen', () => {
  const vars = Ch1Logic.campusVars(CAMPUS);
  assert.equal(vars.identity, CAMPUS.identity);
  assert.equal(vars.course, CAMPUS.course);
  assert.equal(Ch1Logic.fill('Kurs {course}, {unbekannt}', vars), `Kurs ${CAMPUS.course}, {unbekannt}`);
});

test('Texte: Pflichthinweis „keine echten Zugangsdaten“, echte Umlaute, keine offenen Platzhalter', () => {
  assert.equal(Ch1Logic.TEXT.noRealCredentials, 'Spiel – bitte keine echten Zugangsdaten eingeben');
  const all = JSON.stringify(Ch1Logic.texts(CAMPUS));
  assert.ok(all.includes('Sicherheitsprüfung'));
  assert.ok(all.includes('Begrüßungs'));
  assert.doesNotMatch(all, /\{[a-zA-Z]+\}/, 'texts() füllt alle Platzhalter');
  assert.doesNotMatch(all, /Platzhalter|TODO|Lorem/);
  // Post-it-Tipps passen auf den Zettel
  for (const [key, tip] of Object.entries(Ch1Logic.texts(CAMPUS).tips)) {
    assert.ok(tip.length <= 160, `Tipp ${key} zu lang (${tip.length})`);
  }
});

test('Toast-Texte bleiben schmal (je Zeile ≤ 32 Zeichen, höchstens 3 Zeilen) – sonst verdecken sie das Post-it', () => {
  const all = Ch1Logic.texts(CAMPUS);
  const toasts = [];
  for (const [section, entries] of Object.entries(all)) {
    if (!entries || typeof entries !== 'object') continue;
    for (const [key, value] of Object.entries(entries)) {
      if (/Toast$/.test(key)) toasts.push([`${section}.${key}`, value]);
    }
  }
  assert.ok(toasts.length >= 6, `Toast-Texte gefunden: ${toasts.map(([k]) => k)}`);
  for (const [key, text] of toasts) {
    const lines = text.split('\n');
    assert.ok(lines.length <= 3, `${key}: ${lines.length} Zeilen`);
    for (const line of lines) assert.ok([...line].length <= 32, `${key}: Zeile zu lang („${line}“)`);
  }
});

test('CAPTCHA-Bildbeschreibungen passen in eine Kachel (≤ 12 Zeichen)', () => {
  for (const [kind, def] of Object.entries(Ch1Logic.CAPTCHA_KINDS)) {
    assert.ok([...def.label].length <= 12, `${kind}: „${def.label}“`);
  }
});

test('Objectives: jede Station hat eine kurze HUD-Aufgabe (≤ 40 Zeichen, HUD-Breite 312 px)', () => {
  const objectives = Ch1Logic.texts(CAMPUS).objectives;
  for (const key of ['login', 'captcha', 'tos', 'password', 'confirm', 'sync', 'done']) {
    assert.ok(objectives[key] && objectives[key].length <= 40, `Aufgabe ${key} passt nicht ins HUD`);
  }
});

test('Mit echtem RNG (falls schon gebaut): Raster und Plan sind über den Seed reproduzierbar', { skip: !HAS_REAL_RNG && 'src/core/rng.js ist noch Platzhalter' }, () => {
  const RNG = vm.runInThisContext('RNG');
  RNG.seed(7);
  const a = [Ch1Logic.createCaptchaGrid(), Ch1Logic.createSyncPlan(undefined, CAMPUS), Ch1Logic.pickSecretWord(undefined, CAMPUS)];
  RNG.seed(7);
  const b = [Ch1Logic.createCaptchaGrid(), Ch1Logic.createSyncPlan(undefined, CAMPUS), Ch1Logic.pickSecretWord(undefined, CAMPUS)];
  assert.deepEqual(a, b);
});
