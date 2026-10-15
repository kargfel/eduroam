/**
 * ch5.test.js – Unit-Tests für die Logik von Kapitel 5 „Der IT-Helpdesk“
 * (src/logic/ch5Helpdesk.js, Global Ch5Logic).
 *
 * Prüft: Support-Formular (Pflichtfelder, Kategorien, Sekretariat, Passwort-Schutz),
 * Dialogrunden (Daten aus CAMPUS, genau eine richtige Antwort, kurze Beschriftungen),
 * Zustandsautomat (Formular → Chat → Warteschleife → Chat → Finale → gelöst),
 * Mitleids-Tipps, Sprechzeiten mit der Spieluhr, Pop-up-Zeitplan, Ticket-Status,
 * Passwort-Maskierung, phished-Flag, kurze Toast-Texte und das Frust-Budget
 * (perfekt ≈ 4 %, normal mit zwei typischen Fehlern ≈ 10 %, zufälliges Klicken ≈ 33 %).
 *
 * Zufall: Die Tests injizieren einen eigenen seedbaren Generator (gleiche API wie RNG),
 * damit sie unabhängig vom globalen Zufallsstrom sind. Ein Test prüft zusätzlich den
 * echten globalen RNG aus src/core/rng.js.
 * Aufruf: node --test "tests/unit/ch5.test.js"
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadScripts, CORE_LOGIC_FILES } = require('./_load.js');

const { CONFIG, CAMPUS, Ch5Logic } = loadScripts(
  [...CORE_LOGIC_FILES, 'src/logic/ch5Helpdesk.js'],
  ['CONFIG', 'CAMPUS', 'Ch5Logic']
);
const HAS_CORE_RNG = vm.runInThisContext("typeof RNG !== 'undefined' && typeof RNG.shuffle === 'function'");

/** Seedbarer Test-Zufall (mulberry32) mit der API von RNG. */
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
    pick: (items) => (items && items.length ? items[Math.floor(next() * items.length)] : undefined),
    shuffle: (items) => {
      const copy = Array.from(items || []);
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

const PASSWORD = 'Brezel2026!Kehrwoche';
const VALID_FORM = Object.freeze({
  category: 'account',
  office: 'course',
  description: 'Konto gesperrt, eduroam sagt Authentifizierung fehlgeschlagen.',
});
const EXPECTED_ROUNDS = ['identity', 'password', 'escalate', 'certificate', 'newPassword', 'restart'];
const F = CONFIG.FRUSTRATION;

/** Neue Session mit Test-Zufall. */
function newSession(seed = 7, context = {}) {
  return Ch5Logic.createSession({ campus: CAMPUS, rng: makeRng(seed), context: { password: PASSWORD, ...context } });
}

/** Spielt die Session perfekt bis zum Ende und sammelt Zwischenstände. */
function playPerfectly(session) {
  const trace = [];
  let guard = 0;
  while (session.getPhase() !== Ch5Logic.PHASES.DONE && guard++ < 100) {
    const phase = session.getPhase();
    if (phase === Ch5Logic.PHASES.FORM) {
      assert.equal(session.submitForm(VALID_FORM).ok, true);
    } else if (phase === Ch5Logic.PHASES.CHAT) {
      const round = session.getRound();
      const correct = round.options.find((o) => o.isCorrect);
      const result = session.answer(correct.id, { clockMinutes: 600 });
      trace.push({ roundId: round.id, result });
    } else if (phase === Ch5Logic.PHASES.HOLD) {
      session.advanceQueue();
    } else if (phase === Ch5Logic.PHASES.FINALE) {
      session.completeRestart();
    }
    trace.push({ phase: session.getPhase(), progress: session.getProgress() });
  }
  return trace;
}

// ---------------------------------------------------------------------------
// Grundgerüst und Daten
// ---------------------------------------------------------------------------

test('Ch5Logic stellt Phasen, Balance-Werte und Funktionen bereit', () => {
  assert.equal(typeof Ch5Logic, 'object');
  assert.deepEqual(
    { ...Ch5Logic.PHASES },
    { FORM: 'form', CHAT: 'chat', HOLD: 'hold', FINALE: 'finale', DONE: 'done' }
  );
  for (const name of [
    'createSession', 'validateTicketForm', 'buildRounds', 'getCategoryOptions', 'getOfficeOptions',
    'getPopup', 'buildPopupSchedule', 'parseOfficeHours', 'getOfficeHoursStatus', 'getStatusLabel',
    'maskPassword', 'getTexts', 'format', 'makeTicketId', 'getTicketUrl', 'getPhishingUrl',
  ]) {
    assert.equal(typeof Ch5Logic[name], 'function', `Ch5Logic.${name} fehlt`);
  }
  assert.ok(Ch5Logic.BALANCE.MERCY_AFTER_WRONG >= 2 && Ch5Logic.BALANCE.MERCY_AFTER_WRONG <= 3);
  assert.ok(Ch5Logic.BALANCE.LONG_PRESS_MS >= 800, 'Long-Press muss spürbar lang sein');
  assert.ok(Object.isFrozen(Ch5Logic) && Object.isFrozen(Ch5Logic.BALANCE) && Object.isFrozen(Ch5Logic.POPUP_SCHEDULE));
});

test('Runden: feste Reihenfolge, 2–4 Optionen, genau eine richtig, kurze Beschriftungen', () => {
  const rounds = Ch5Logic.buildRounds(CAMPUS, { password: PASSWORD });
  assert.deepEqual(rounds.map((r) => r.id), EXPECTED_ROUNDS);
  for (const round of rounds) {
    assert.ok(['first', 'second'].includes(round.agent), `${round.id}: Agent`);
    assert.ok(round.message.length > 20, `${round.id}: Nachricht`);
    assert.ok(round.mercy && round.mercy.length > 10, `${round.id}: Mitleids-Tipp`);
    assert.ok(round.progressAfter > 0 && round.progressAfter < 1, `${round.id}: Fortschritt`);
    const minOptions = round.id === 'restart' ? 2 : 3;
    assert.ok(round.options.length >= minOptions && round.options.length <= 4, `${round.id}: Optionsanzahl`);
    assert.equal(round.options.filter((o) => o.isCorrect).length, 1, `${round.id}: genau eine richtige Antwort`);
    const ids = round.options.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, `${round.id}: eindeutige Options-IDs`);
    for (const option of round.options) {
      assert.ok(option.label.length > 0 && option.label.length <= Ch5Logic.BALANCE.OPTION_LABEL_MAX,
        `${round.id}/${option.id}: Beschriftung zu lang (${option.label.length})`);
      assert.ok(option.reply || option.byHours, `${round.id}/${option.id}: Antwort fehlt`);
      if (!option.isCorrect) {
        assert.ok(option.reason && option.reason.length <= 32, `${round.id}/${option.id}: kurzer Grund fehlt`);
        assert.ok(option.frustration > 0, `${round.id}/${option.id}: falsch muss Frust kosten`);
      }
    }
  }
  // Fortschritt steigt von Runde zu Runde
  for (let i = 1; i < rounds.length; i++) assert.ok(rounds[i].progressAfter > rounds[i - 1].progressAfter);
});

test('Runden nutzen Werte aus CAMPUS statt hart codierter Daten', () => {
  const rounds = Ch5Logic.buildRounds(CAMPUS, { password: PASSWORD });
  const byId = Object.fromEntries(rounds.map((r) => [r.id, r]));
  const identity = byId.identity;
  assert.equal(identity.options.find((o) => o.isCorrect).label, CAMPUS.identity);
  const labels = identity.options.map((o) => o.label);
  assert.ok(labels.includes(CAMPUS.username), 'Kennung ohne Realm als Falle');
  assert.ok(labels.includes(CAMPUS.anonymousIdentity), 'anonyme Identität als Falle');

  const certificate = byId.certificate;
  assert.ok(certificate.options.find((o) => o.isCorrect).label.includes(CAMPUS.wifi.caCertOption));
  assert.ok(certificate.options.find((o) => o.isCorrect).reply.includes(CAMPUS.wifi.domain));
  assert.ok(certificate.options.some((o) => o.label.includes(CAMPUS.certificate.outdatedRootCA)));

  const escalate = byId.escalate;
  assert.ok(escalate.options.some((o) => o.label.includes(CAMPUS.helpdesk.phone)));
  assert.ok(escalate.message.length > 0);
  assert.ok(byId.identity.message.includes(CAMPUS.helpdesk.name));
});

test('Passwort-Runde: Verweigern ist richtig, Passwort wird nur maskiert angezeigt', () => {
  const round = Ch5Logic.buildRounds(CAMPUS, { password: PASSWORD }).find((r) => r.id === 'password');
  const correct = round.options.find((o) => o.isCorrect);
  assert.match(correct.label, /nie/i);
  assert.ok(correct.relief > 0, 'bestandener Phishing-Test senkt Frust');
  const send = round.options.find((o) => o.id === 'send');
  assert.ok(send.stamp, 'Passwort verraten ist ein echter Rückschlag (Stempel)');
  assert.ok(send.frustration >= F.LARGE);
  for (const option of round.options) assert.ok(!option.label.includes(PASSWORD), 'Klartext-Passwort in Beschriftung');
});

test('maskPassword zeigt höchstens zwei Zeichen und nie das ganze Passwort', () => {
  const masked = Ch5Logic.maskPassword(PASSWORD);
  assert.ok(masked.startsWith('Br'));
  assert.ok(!masked.includes(PASSWORD.slice(2, 6)));
  assert.ok(masked.length <= 12);
  assert.equal(Ch5Logic.maskPassword(''), '••••••••');
  assert.equal(Ch5Logic.maskPassword(null), '••••••••');
  assert.equal(Ch5Logic.maskPassword('ab'), '••••••••');
});

// ---------------------------------------------------------------------------
// Support-Formular
// ---------------------------------------------------------------------------

test('Formular-Optionen: Kategorien fest, Sekretariat aus CAMPUS, „Weiß ich nicht“ deaktiviert', () => {
  const categories = Ch5Logic.getCategoryOptions();
  assert.ok(categories.length >= 4);
  assert.ok(categories.some((c) => c.value === 'account'));
  assert.ok(categories.some((c) => c.value === 'wlan'));
  assert.ok(categories.some((c) => /RosettaStone/.test(c.label)), 'echte Kategorie aus dem Support-Formular');

  const offices = Ch5Logic.getOfficeOptions(CAMPUS);
  const course = offices.find((o) => o.value === 'course');
  assert.ok(course.label.includes(CAMPUS.courseName));
  assert.ok(offices.some((o) => o.label === CAMPUS.helpdesk.name));
  const unknown = offices.find((o) => o.value === 'unknown');
  assert.equal(unknown.disabled, true);
  assert.ok(unknown.hint.length > 0);
});

test('Formular: Pflichtfelder werden der Reihe nach geprüft', () => {
  const empty = Ch5Logic.validateTicketForm({}, CAMPUS, { passwords: [PASSWORD] });
  assert.equal(empty.ok, false);
  assert.equal(empty.field, 'category');
  assert.equal(empty.code, 'missing');
  assert.ok(empty.message.length > 0 && empty.reason.length > 0);
  assert.ok(empty.frustration > 0);

  const noOffice = Ch5Logic.validateTicketForm({ category: 'account' }, CAMPUS);
  assert.equal(noOffice.field, 'office');
  assert.equal(noOffice.code, 'missing');

  const unknownOffice = Ch5Logic.validateTicketForm({ category: 'account', office: 'unknown' }, CAMPUS);
  assert.equal(unknownOffice.field, 'office');

  const noDescription = Ch5Logic.validateTicketForm({ category: 'account', office: 'course' }, CAMPUS);
  assert.equal(noDescription.field, 'description');
  assert.equal(noDescription.code, 'short');

  const shortDescription = Ch5Logic.validateTicketForm({ category: 'account', office: 'course', description: 'geht nicht' }, CAMPUS);
  assert.equal(shortDescription.code, 'short');
  assert.ok(shortDescription.message.includes(String(Ch5Logic.BALANCE.DESCRIPTION_MIN_LENGTH)));

  const ok = Ch5Logic.validateTicketForm(VALID_FORM, CAMPUS, { passwords: [PASSWORD] });
  assert.equal(ok.ok, true);
  assert.equal(ok.code, 'ok');
  assert.equal(ok.minutes, 0);
  assert.equal(ok.category, 'account');
});

test('Formular: falsche Kategorien und Sekretariate haben eigene Rückmeldungen', () => {
  for (const category of ['password', 'rosetta', 'printing', 'other']) {
    const result = Ch5Logic.validateTicketForm({ ...VALID_FORM, category }, CAMPUS);
    assert.equal(result.ok, false, category);
    assert.equal(result.field, 'category');
    assert.equal(result.code, category);
    assert.ok(result.message.length > 20, `${category}: Text`);
  }
  const forwarded = Ch5Logic.validateTicketForm({ ...VALID_FORM, office: 'technik' }, CAMPUS);
  assert.equal(forwarded.field, 'office');
  assert.ok(forwarded.minutes > 0, 'Weiterleitung kostet Zeit');
  const its = Ch5Logic.validateTicketForm({ ...VALID_FORM, office: 'its' }, CAMPUS);
  assert.equal(its.field, 'office');
  assert.match(its.message, /kein Sekretariat/);
});

test('Formular: WLAN-Kategorie wird angenommen, aber verschoben (nur Zeitstrafe)', () => {
  const result = Ch5Logic.validateTicketForm({ ...VALID_FORM, category: 'wlan' }, CAMPUS);
  assert.equal(result.ok, true);
  assert.equal(result.code, 'recategorized');
  assert.equal(result.isSoft, true);
  assert.ok(result.minutes > 0);
  assert.equal(result.frustration, 0);
  assert.equal(result.category, 'account', 'wird nach „Account gesperrt“ verschoben');
  assert.ok(result.fromLabel.includes('WLAN'));
});

test('Formular: Passwort in der Beschreibung wird abgelehnt und soll geleert werden', () => {
  const result = Ch5Logic.validateTicketForm(
    { ...VALID_FORM, description: `Mein Passwort ist ${PASSWORD}, bitte prüfen` },
    CAMPUS,
    { passwords: [PASSWORD] }
  );
  assert.equal(result.ok, false);
  assert.equal(result.field, 'description');
  assert.equal(result.code, 'password');
  assert.equal(result.clearField, true);
  assert.ok(result.frustration >= F.SMALL);
  // Auch das Initialpasswort aus dem Begrüßungsbrief zählt
  const initial = Ch5Logic.validateTicketForm(
    { ...VALID_FORM, description: `Initialpasswort ${CAMPUS.initialPassword} geht nicht` }, CAMPUS
  );
  assert.equal(initial.code, 'password');
});

test('Session: Formularfehler zählen je Feld, Mitleids-Tipp ab dem zweiten Fehler', () => {
  const session = newSession();
  const first = session.submitForm({ category: 'rosetta', office: 'course', description: VALID_FORM.description });
  assert.equal(first.ok, false);
  assert.equal(first.showMercy, false);
  const second = session.submitForm({ category: 'other', office: 'course', description: VALID_FORM.description });
  assert.equal(second.showMercy, true);
  assert.ok(second.mercy.includes('Account gesperrt'), 'Tipp nennt die richtige Kategorie');
  const officeError = session.submitForm({ category: 'account', office: 'technik', description: VALID_FORM.description });
  assert.equal(officeError.field, 'office');
  assert.equal(officeError.showMercy, false, 'Zähler je Feld');
  assert.equal(session.getPhase(), 'form');
});

// ---------------------------------------------------------------------------
// Zustandsautomat
// ---------------------------------------------------------------------------

test('Session: perfekter Ablauf vom Formular bis „Gelöst“ ohne Frust', () => {
  const session = newSession();
  assert.equal(session.getPhase(), 'form');
  assert.equal(session.getProgress(), 0);
  assert.equal(session.getRound(), null, 'im Formular gibt es keine Runde');
  const trace = playPerfectly(session);
  assert.equal(session.getPhase(), 'done');
  assert.equal(session.getProgress(), 1);
  assert.equal(session.getStatusLabel(), 'Gelöst');
  const roundIds = trace.filter((t) => t.roundId).map((t) => t.roundId);
  assert.deepEqual(roundIds, EXPECTED_ROUNDS);
  for (const step of trace.filter((t) => t.result)) {
    assert.equal(step.result.correct, true);
    assert.equal(step.result.frustration, 0);
    assert.equal(step.result.minutes, 0);
  }
  const progresses = trace.filter((t) => t.progress !== undefined).map((t) => t.progress);
  for (let i = 1; i < progresses.length; i++) assert.ok(progresses[i] >= progresses[i - 1], 'Fortschritt sinkt nie');
  assert.ok(trace.some((t) => t.phase === 'hold'), 'Warteschleife kommt vor');
  assert.equal(session.getDebugState().hasRestarted, true);
});

test('Session: Phasenwechsel an den richtigen Stellen', () => {
  const session = newSession();
  session.submitForm(VALID_FORM);
  assert.equal(session.getPhase(), 'chat');
  assert.equal(session.getProgress(), Ch5Logic.PROGRESS.TICKET_CREATED);
  assert.equal(session.getRound().agent, 'first');
  const answerCorrect = () => session.answer(session.getRound().options.find((o) => o.isCorrect).id);
  answerCorrect(); // identity
  answerCorrect(); // password
  const escalate = answerCorrect();
  assert.equal(escalate.phase, 'hold');
  assert.equal(session.getPhase(), 'hold');
  assert.equal(session.getRound(), null);
  assert.equal(session.getQueuePosition(), Ch5Logic.BALANCE.HOLD_QUEUE_START);
  let guard = 0;
  while (session.getPhase() === 'hold' && guard++ < 30) session.advanceQueue();
  assert.equal(session.getPhase(), 'chat');
  assert.equal(session.getRound().id, 'certificate');
  assert.equal(session.getRound().agent, 'second');
  answerCorrect(); // certificate
  const unlock = answerCorrect(); // newPassword
  assert.equal(unlock.roundId, 'newPassword');
  assert.equal(session.getRound().id, 'restart');
  const finale = answerCorrect();
  assert.equal(finale.phase, 'finale');
  assert.equal(session.getPhase(), 'finale');
  assert.deepEqual(session.completeRestart(), { solved: true });
  assert.equal(session.getPhase(), 'done');
});

test('Session: Optionen werden je Runde gemischt, aber deterministisch', () => {
  const orders = (seed) => {
    const session = newSession(seed);
    session.submitForm(VALID_FORM);
    return session.getRound().options.map((o) => o.id).join(',');
  };
  assert.equal(orders(3), orders(3));
  const distinct = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(orders));
  assert.ok(distinct.size > 1, 'verschiedene Seeds mischen unterschiedlich');
});

test('Session: falsche Antwort kostet Frust, sperrt die Option, Mitleids-Tipp nach zwei Fehlern', () => {
  const session = newSession();
  session.submitForm(VALID_FORM);
  const round = session.getRound();
  const wrong = round.options.filter((o) => !o.isCorrect);
  const before = session.getProgress();

  const first = session.answer(wrong[0].id);
  assert.equal(first.correct, false);
  assert.equal(first.advanced, false);
  assert.ok(first.frustration > 0);
  assert.ok(first.reply.length > 10 && first.reason.length > 0);
  assert.equal(first.showMercy, false);
  assert.equal(session.getProgress(), before, 'kein Fortschritt bei falscher Antwort');
  assert.equal(session.getRound().options.find((o) => o.id === wrong[0].id).isDisabled, true);

  const again = session.answer(wrong[0].id);
  assert.equal(again.ignored, true, 'gesperrte Option nicht doppelt wählbar');

  const second = session.answer(wrong[1].id);
  assert.equal(second.showMercy, true);
  assert.equal(second.mercy, round.mercy);
  assert.equal(session.getDebugState().wrongInRound, 2);

  const correct = session.answer(round.options.find((o) => o.isCorrect).id);
  assert.equal(correct.correct, true);
  assert.equal(session.getDebugState().wrongInRound, 0, 'Zähler je Runde');
  assert.equal(session.getRound().id, 'password');
});

test('Session: Lüge im Finale („Ja, natürlich.“) kostet etwas Frust, führt aber ins Finale', () => {
  const session = newSession();
  session.submitForm(VALID_FORM);
  let guard = 0;
  while (session.getPhase() !== 'finale' && guard++ < 50) {
    if (session.getPhase() === 'hold') { session.advanceQueue(); continue; }
    const round = session.getRound();
    if (round.id === 'restart') {
      const lie = session.answer('lie');
      assert.equal(lie.correct, false);
      assert.equal(lie.advanced, true);
      assert.ok(lie.frustration > 0 && lie.frustration <= F.SMALL);
      break;
    }
    session.answer(round.options.find((o) => o.isCorrect).id);
  }
  assert.equal(session.getPhase(), 'finale');
});

test('Session: Neustart vor dem Finale löst nichts, Neustart während der Finalfrage schon', () => {
  const session = newSession();
  assert.deepEqual(session.completeRestart(), { solved: false });
  session.submitForm(VALID_FORM);
  assert.deepEqual(session.completeRestart(), { solved: false });
  assert.equal(session.getPhase(), 'chat');
  assert.equal(session.getDebugState().hasRestarted, true);
  let guard = 0;
  while (!(session.getRound() && session.getRound().id === 'restart') && guard++ < 50) {
    if (session.getPhase() === 'hold') session.advanceQueue();
    else session.answer(session.getRound().options.find((o) => o.isCorrect).id);
  }
  assert.deepEqual(session.completeRestart(), { solved: true }, 'wer es einfach macht, ist fertig');
  assert.equal(session.getPhase(), 'done');
});

test('Session: Aktionen in der falschen Phase werden ignoriert', () => {
  const session = newSession();
  assert.equal(session.answer('identity').ignored, true);
  assert.equal(session.advanceQueue().ignored, true);
  assert.equal(session.applySessionTimeout().ignored, true);
  session.submitForm(VALID_FORM);
  assert.equal(session.submitForm(VALID_FORM).ignored, true);
  assert.equal(session.answer('gibt-es-nicht').ignored, true);
});

test('Session: solvePerfectly() fährt den Automaten fehlerfrei ans Ende', () => {
  const session = newSession(11);
  session.solvePerfectly();
  assert.equal(session.getPhase(), 'done');
  assert.equal(session.getProgress(), 1);
  const state = session.getDebugState();
  assert.equal(state.wrongTotal, 0);
  assert.equal(state.hasRestarted, true);
  assert.equal(session.getTicketId().startsWith(CAMPUS.helpdesk.ticketPrefix + '-'), true);
});

// ---------------------------------------------------------------------------
// Warteschleife
// ---------------------------------------------------------------------------

test('Warteschleife: zählt herunter, genau ein Rückschlag, Timeout wirft zurück, endet bei 0', () => {
  const session = newSession(5);
  session.submitForm(VALID_FORM);
  for (let i = 0; i < 3; i++) session.answer(session.getRound().options.find((o) => o.isCorrect).id);
  assert.equal(session.getPhase(), 'hold');
  const events = [];
  let guard = 0;
  while (session.getPhase() === 'hold' && guard++ < 40) {
    const step = session.advanceQueue();
    events.push(step.event);
    assert.ok(step.position >= 0 && step.position <= Ch5Logic.BALANCE.HOLD_QUEUE_MAX);
    assert.ok(step.message && step.message.length > 0);
  }
  assert.equal(events.filter((e) => e === 'setback').length, 1, 'genau ein Notfall wird vorgezogen');
  assert.equal(events[events.length - 1], 'done');
  const expectedSteps = Ch5Logic.BALANCE.HOLD_QUEUE_START + Ch5Logic.BALANCE.HOLD_SETBACK_AMOUNT + 1;
  assert.equal(events.length, expectedSteps);
  assert.equal(session.getProgress(), Ch5Logic.PROGRESS.HOLD_DONE);

  // Timeout in der Warteschleife
  const other = newSession(6);
  other.submitForm(VALID_FORM);
  for (let i = 0; i < 3; i++) other.answer(other.getRound().options.find((o) => o.isCorrect).id);
  const start = other.getQueuePosition();
  const timeout = other.applySessionTimeout();
  assert.equal(timeout.position, Math.min(Ch5Logic.BALANCE.HOLD_QUEUE_MAX, start + Ch5Logic.BALANCE.HOLD_TIMEOUT_SETBACK));
  assert.ok(timeout.message.includes(String(timeout.position)));
});

// ---------------------------------------------------------------------------
// Sprechzeiten mit der Spieluhr
// ---------------------------------------------------------------------------

test('Sprechzeiten: CAMPUS.helpdesk.hours wird geparst', () => {
  const hours = Ch5Logic.parseOfficeHours('Mo–Do 09:00–11:00');
  assert.equal(hours.fromMinutes, 9 * 60);
  assert.equal(hours.toMinutes, 11 * 60);
  assert.deepEqual(hours.days, [0, 1, 2, 3]);
  const campusHours = Ch5Logic.parseOfficeHours(CAMPUS.helpdesk.hours);
  assert.ok(campusHours.toMinutes > campusHours.fromMinutes);
  const fallback = Ch5Logic.parseOfficeHours('nach Vereinbarung');
  assert.equal(fallback.fromMinutes, 9 * 60, 'Rückfall auf 09:00–11:00');
  assert.equal(fallback.toMinutes, 11 * 60);
  assert.equal(Ch5Logic.parseOfficeHours('Mo-Fr 8:30-12:15').toMinutes, 12 * 60 + 15, 'auch mit einfachem Bindestrich');
});

test('Sprechzeiten: Status hängt von der Spieluhr ab (vorher, offen, danach, Tag 2, Freitag)', () => {
  const hours = 'Mo–Do 09:00–11:00';
  const before = Ch5Logic.getOfficeHoursStatus(CONFIG.CLOCK.START_MINUTES, hours);
  assert.equal(before.isOpen, false);
  assert.equal(before.minutesUntilOpen, 90);
  assert.match(before.text, /geschlossen/);
  assert.match(before.text, /09:00/);

  const open = Ch5Logic.getOfficeHoursStatus(10 * 60 + 30, hours);
  assert.equal(open.isOpen, true);
  assert.equal(open.minutesUntilClose, 30);
  assert.match(open.text, /geöffnet/);

  const after = Ch5Logic.getOfficeHoursStatus(11 * 60, hours);
  assert.equal(after.isOpen, false, '11:00 ist schon zu');
  assert.match(after.text, /morgen/);

  const dayTwo = Ch5Logic.getOfficeHoursStatus(24 * 60 + 9 * 60 + 5, hours);
  assert.equal(dayTwo.isOpen, true, 'Dienstag ist auch Sprechtag');

  const friday = Ch5Logic.getOfficeHoursStatus(4 * 24 * 60 + 10 * 60, hours);
  assert.equal(friday.isOpen, false, 'Freitag keine Sprechzeit');
});

test('Anruf-Option: Antwort und Zeitstrafe hängen von den Sprechzeiten ab', () => {
  const reachEscalate = () => {
    const session = newSession();
    session.submitForm(VALID_FORM);
    session.answer(session.getRound().options.find((o) => o.isCorrect).id);
    session.answer(session.getRound().options.find((o) => o.isCorrect).id);
    assert.equal(session.getRound().id, 'escalate');
    return session;
  };
  const closed = reachEscalate().answer('call', { clockMinutes: CONFIG.CLOCK.START_MINUTES });
  const open = reachEscalate().answer('call', { clockMinutes: 10 * 60 });
  assert.equal(closed.correct, false);
  assert.equal(open.correct, false);
  assert.notEqual(closed.reply, open.reply);
  assert.match(closed.reply, /außerhalb/);
  assert.ok(closed.reply.includes(CAMPUS.helpdesk.hours));
  assert.match(open.reply, /Warteschlange/);
  assert.ok(open.minutes > closed.minutes, 'Warteschleife am Telefon dauert länger');
  assert.notEqual(open.reason, closed.reason);
});

// ---------------------------------------------------------------------------
// Pop-ups
// ---------------------------------------------------------------------------

test('Pop-up-Typen: alle definiert, × reicht immer, Fallen kosten etwas', () => {
  assert.ok(Ch5Logic.POPUP_TYPES.length >= 8);
  for (const type of Ch5Logic.POPUP_TYPES) {
    const popup = Ch5Logic.getPopup(type, CAMPUS, { ticketId: 'ITSD-111111', otherTicketId: 'ITSD-222222' });
    assert.equal(popup.type, type);
    assert.ok(popup.title.length > 0 && popup.text.length > 0, `${type}: Texte`);
    assert.ok(!/\{(?!seconds\})[a-zA-Z]+\}/.test(popup.title + popup.text), `${type}: offener Platzhalter`);
    for (const action of popup.actions) {
      assert.ok(action.label.length > 0 && action.label.length <= 24, `${type}/${action.id}: Beschriftung`);
      if (action.trap) assert.ok(action.trap.reason && (action.trap.frustration > 0 || action.trap.minutes > 0), `${type}: Falle`);
    }
  }
  assert.equal(Ch5Logic.getPopup('gibt-es-nicht', CAMPUS), null);
  const merged = Ch5Logic.getPopup('merged', CAMPUS, { otherTicketId: 'ITSD-222222' });
  assert.ok(merged.text.includes('ITSD-222222'));
  const timeout = Ch5Logic.getPopup('timeout', CAMPUS);
  assert.ok(timeout.timeoutSeconds > 0 && timeout.onTimeout.frustration > 0);
  assert.ok(timeout.text.includes('{seconds}'), 'Sekunden setzt die Szene pro Tick ein');
  assert.ok(Ch5Logic.format(timeout.text, { seconds: 5 }).includes('5 s'));
  const phishing = Ch5Logic.getPopup('phishing', CAMPUS);
  assert.ok(phishing.text.includes(Ch5Logic.getPhishingUrl(CAMPUS)));
  assert.ok(phishing.actions[0].trap.stamp, 'auf Phishing hereinfallen ist ein echter Rückschlag');
  assert.ok(Ch5Logic.getPopup('cookie', CAMPUS).isBanner);
});

test('Phishing-URL und Ticket-URL sind .example (keine echten Domains)', () => {
  const phishingUrl = Ch5Logic.getPhishingUrl(CAMPUS);
  assert.match(phishingUrl, /\.example(\/|$)/);
  assert.ok(phishingUrl.includes('dhbw-stuttgart.de.'), 'sieht auf den ersten Blick echt aus');
  assert.match(Ch5Logic.getTicketUrl(CAMPUS), /^https:\/\/[^/]+\.example\//);
});

test('Pop-up-Zeitplan: deterministisch, aufsteigend, Phishing und Timeout garantiert', () => {
  const chatA = Ch5Logic.buildPopupSchedule('chat', makeRng(42));
  const chatB = Ch5Logic.buildPopupSchedule('chat', makeRng(42));
  assert.deepEqual(chatA, chatB);
  assert.equal(chatA.length, Ch5Logic.POPUP_SCHEDULE.CHAT_COUNT);
  assert.equal(chatA[0].type, 'merged');
  assert.equal(chatA[0].atMs, Ch5Logic.POPUP_SCHEDULE.CHAT_FIRST_MS);
  for (let i = 1; i < chatA.length; i++) {
    const gap = chatA[i].atMs - chatA[i - 1].atMs;
    assert.ok(gap >= Ch5Logic.POPUP_SCHEDULE.CHAT_GAP_MIN_MS && gap <= Ch5Logic.POPUP_SCHEDULE.CHAT_GAP_MAX_MS);
  }
  assert.equal(chatA.filter((p) => p.type === 'phishing').length, 1);
  assert.equal(chatA.filter((p) => p.type === 'timeout').length, 1);
  assert.notEqual(chatA[1].type, 'phishing', 'Phishing nicht direkt zu Beginn');
  for (const entry of chatA) assert.ok(Ch5Logic.POPUP_TYPES.includes(entry.type));

  const hold = Ch5Logic.buildPopupSchedule('hold', makeRng(42));
  assert.equal(hold.length, Ch5Logic.POPUP_SCHEDULE.HOLD_COUNT);
  assert.equal(hold.filter((p) => p.type === 'timeout').length, 1);
  const holdDuration = (Ch5Logic.BALANCE.HOLD_QUEUE_START + Ch5Logic.BALANCE.HOLD_SETBACK_AMOUNT + 1)
    * Ch5Logic.POPUP_SCHEDULE.HOLD_STEP_MS;
  const timeoutAt = hold.find((p) => p.type === 'timeout').atMs;
  assert.ok(timeoutAt + Ch5Logic.BALANCE.SESSION_TIMEOUT_SECONDS * 1000 < holdDuration,
    'Timeout in der Warteschleife muss noch vor deren Ende lösbar sein');
  assert.ok(hold[hold.length - 1].atMs < holdDuration);

  const form = Ch5Logic.buildPopupSchedule('form', makeRng(1));
  assert.deepEqual(form, [{ atMs: Ch5Logic.POPUP_SCHEDULE.FORM_COOKIE_MS, type: 'cookie' }]);
  assert.deepEqual(Ch5Logic.buildPopupSchedule('unbekannt', makeRng(1)), []);
});

// ---------------------------------------------------------------------------
// Ticket-Status, Texte, phished
// ---------------------------------------------------------------------------

test('Ticket-Status (Boss-HP): Etiketten nach Fortschritt', () => {
  assert.equal(Ch5Logic.getStatusLabel(0), 'Entwurf');
  assert.equal(Ch5Logic.getStatusLabel(Ch5Logic.PROGRESS.TICKET_CREATED), 'Offen');
  assert.equal(Ch5Logic.getStatusLabel(0.3), 'In Bearbeitung');
  assert.equal(Ch5Logic.getStatusLabel(0.5), 'Eskaliert');
  assert.equal(Ch5Logic.getStatusLabel(0.9), 'Lösung vorgeschlagen');
  assert.equal(Ch5Logic.getStatusLabel(1), 'Gelöst');
  assert.equal(Ch5Logic.getStatusLabel(-1), 'Entwurf');
  assert.equal(Ch5Logic.getStatusLabel(2), 'Gelöst');
});

test('Texte: Platzhalter aus CAMPUS aufgelöst, Ziele kurz genug fürs HUD', () => {
  const texts = Ch5Logic.getTexts(CAMPUS, { totalFails: 0 });
  for (const [key, value] of Object.entries(texts)) {
    assert.equal(typeof value, 'string', key);
    assert.ok(!/\{(helpdesk|identity|hours|courseName|realm|lms)\}/.test(value), `${key}: offener Campus-Platzhalter`);
  }
  for (const key of Object.keys(texts).filter((k) => k.startsWith('objective'))) {
    assert.ok(texts[key].length <= 40, `${key} zu lang fürs HUD (${texts[key].length})`);
  }
  assert.ok(texts.formDisclaimer.includes('keine echten Zugangsdaten'));
  assert.ok(texts.lockStatus.includes(CAMPUS.identity));
  assert.ok(texts.lockStatus.includes(String(Ch5Logic.BALANCE.MIN_LOCK_ATTEMPTS)), 'mindestens 5 Fehlversuche');
  const many = Ch5Logic.getTexts(CAMPUS, { totalFails: 23 });
  assert.ok(many.lockStatus.includes('23'), 'echte Fehlversuche aus dem Lauf');
  assert.equal(Ch5Logic.format('A {x} B {y}', { x: 1 }), 'A 1 B {y}', 'unbekannte Platzhalter bleiben');
});

test('phished-Flag aus Kapitel 4: Kevin taucht in Sperrmeldung und Antworten auf', () => {
  const plain = Ch5Logic.getTexts(CAMPUS, { isPhished: false });
  const phished = Ch5Logic.getTexts(CAMPUS, { isPhished: true });
  assert.ok(!plain.lockStatus.includes('Kevin'));
  assert.ok(phished.lockStatus.includes('Kevin'));
  const rounds = Ch5Logic.buildRounds(CAMPUS, { isPhished: true, password: PASSWORD });
  const send = rounds.find((r) => r.id === 'password').options.find((o) => o.id === 'send');
  assert.ok(send.reply.includes('Kevin'));
});

test('Ticketnummer: Präfix aus CAMPUS, sechsstellig, deterministisch', () => {
  const a = Ch5Logic.makeTicketId(CAMPUS, makeRng(9));
  const b = Ch5Logic.makeTicketId(CAMPUS, makeRng(9));
  assert.equal(a, b);
  assert.match(a, new RegExp(`^${CAMPUS.helpdesk.ticketPrefix}-\\d{6}$`));
});

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

test('Frust-Budget: perfekt wenig, normal 8–12 %, schludrig 25–35 %, Worst Case begrenzt', () => {
  const B = Ch5Logic.BALANCE;
  const rounds = Ch5Logic.buildRounds(CAMPUS, { password: PASSWORD });
  const byId = Object.fromEntries(rounds.map((r) => [r.id, r]));
  const wrongCosts = rounds.map((round) => round.options.filter((o) => !o.isCorrect).map((o) => o.frustration));
  // Unvermeidbar: Zusammenführung, Warteschleife, Notfall – abzüglich bestandenem Phishing-Test
  const relief = byId.password.options.find((o) => o.isCorrect).relief;
  const baseline = B.MERGED_FRUSTRATION + B.HOLD_FRUSTRATION + B.HOLD_SETBACK_FRUSTRATION - relief;
  assert.ok(baseline >= 2 && baseline <= 6, `perfekt: ${baseline} %`);
  // Normal: zwei typische Fehler – „Ich rufe an“ und „Ja, natürlich.“ (wie tests/e2e/ch5.mjs)
  const call = byId.escalate.options.find((o) => o.id === 'call').frustration;
  const lie = byId.restart.options.find((o) => o.id === 'lie').frustration;
  const normal = baseline + call + lie;
  assert.ok(normal >= 8 && normal <= 12, `normal: ${normal} %`);
  // Schludrig: zufällig klicken; nach MERCY_AFTER_WRONG Fehlern zeigt der Mitleids-Tipp die Lösung.
  // Bei n Optionen ist die Zahl der Fehlklicks vor der richtigen gleichverteilt auf 0 … n−1.
  const sloppy = baseline + wrongCosts.reduce((sum, costs) => {
    const n = costs.length + 1;
    let expectedWrong = 0;
    for (let k = 0; k < n; k++) expectedWrong += Math.min(k, B.MERCY_AFTER_WRONG) / n;
    const average = costs.reduce((a, b) => a + b, 0) / costs.length;
    return sum + expectedWrong * average;
  }, 0);
  assert.ok(sloppy >= 25 && sloppy <= 35, `schludrig: ${sloppy.toFixed(1)} %`);
  // Worst Case: je Runde die zwei teuersten Fehler, danach hilft der Mitleids-Tipp
  const worst = baseline + wrongCosts.reduce((sum, costs) =>
    sum + [...costs].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0), 0);
  assert.ok(worst < CONFIG.FRUSTRATION.MAX * 0.6, `Worst Case: ${worst} %`);
});

test('Toast-Texte sind kurz (breite Pillen würden das Post-it verdecken)', () => {
  const texts = Ch5Logic.getTexts(CAMPUS);
  const toastKeys = Object.keys(texts).filter((key) => key.startsWith('toast') || key.startsWith('hours') && key !== 'hoursLine');
  assert.ok(toastKeys.length >= 8, `Toast-Texte gefunden (${toastKeys.join(', ')})`);
  for (const key of toastKeys) assert.ok(texts[key].length <= 40, `${key} zu lang (${texts[key].length})`);
  const unknown = Ch5Logic.getOfficeOptions(CAMPUS).find((o) => o.value === 'unknown');
  assert.ok(unknown.hint.length <= 40, 'Hinweis der deaktivierten Option erscheint als Toast');
  assert.ok(texts.phoneStatusConnecting.length <= 26, 'Handy-Statuszeile passt in die WLAN-Liste');
});

test('Ohne injizierten Zufall nutzt die Logik den globalen RNG (sobald vorhanden)', { skip: !HAS_CORE_RNG && 'src/core/rng.js ist noch ein Platzhalter' }, () => {
  const RNG = vm.runInThisContext('RNG');
  RNG.seed(7);
  const a = Ch5Logic.buildPopupSchedule('chat');
  RNG.seed(7);
  const b = Ch5Logic.buildPopupSchedule('chat');
  assert.deepEqual(a, b);
  RNG.seed(7);
  const session = Ch5Logic.createSession({ campus: CAMPUS });
  assert.equal(session.getPhase(), 'form');
});
