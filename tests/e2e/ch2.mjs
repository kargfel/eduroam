/**
 * ch2.mjs – Browser-Tests für Kapitel 2 „Die Konfiguration“ (Ch2ConfigScene).
 *
 * Alle Eingaben laufen als echte Klicks/Tastendrücke (Playwright). Die Klickziele der
 * aktuellen Handy-Seite liefert die Szene über getDebugInfo().targets (Spielkoordinaten),
 * Einträge offener Auswahllisten UI.Dropdown.getOptionBounds(). Werte kommen aus CAMPUS
 * bzw. GameState.getCredentials(), nichts ist hart codiert.
 *
 * Tests:
 *  1. Happy Path: altes Profil entfernen, Dialog korrekt ausfüllen (inkl. Autokorrektur
 *     und EN-Tastatur), im ersten Versuch verbinden → beide Erfolge, Kapitel 3 startet.
 *  2. Fehlerpfad (schludrig): altes Profil stur probieren, Merkblatt blind abtippen →
 *     „Gespeichert“, Feldfehler, Mitleids-Tipps, Stempel – und trotzdem keine Sackgasse.
 *  3. Balance „normaler“ Lauf: Domain vergessen, von der EN-Tastatur erwischt → 8–12 % Frust.
 *  4. Nachbarnetze und Play Store: Witze, Zeitstrafe einmalig, keine Fehlversuche.
 *  5. debugSolve: mitten im Verbinden und mit offener Auswahlliste.
 *  6. Pause/Weiter über die HUD-Buttons: Timer und Tastatur ruhen, danach geht es weiter.
 *  7. „Kapitel neu starten“ setzt alles zurück.
 * Screenshots: screenshots/ch2-*.png
 *
 * Aufruf: node tests/e2e/ch2.mjs   (nur einzelne Tests: CH2_ONLY="Balance" node tests/e2e/ch2.mjs)
 */
import { launchGame, runTest, assert } from './harness.mjs';

const QUERY = 'chapter=2&skipintro=1&seed=7';
const CHAPTER_KEY = 'Ch2Config';
/**
 * Wartezeit für Zustände, die an Szenen-Timern hängen (Verbinden, Kapitelende). Großzügig:
 * Phaser deckelt delta in den ersten 120 Frames auf 16,7 ms – bei langsamen Headless-Frames
 * (parallele Testläufe, Load > 50) dauert ein 2-s-Szenentimer real 10–20 s.
 */
const STATE_TIMEOUT = 45000;

/** Optionaler Filter: nur Tests, deren Name CH2_ONLY enthält. */
const ONLY = process.env.CH2_ONLY || '';
const test = (name, fn) => (ONLY && !name.includes(ONLY) ? Promise.resolve() : runTest(name, fn));

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

/**
 * Wartet einige Bildschirm-Frames: Phaser verarbeitet Maus- und Tastatur-Events erst im
 * nächsten Spielschritt. Danach sind alle bisher ausgelösten Eingaben angekommen.
 */
function settle(g, frames = 3) {
  return g.eval((count) => new Promise((resolve) => {
    let left = count;
    const step = () => {
      left -= 1;
      if (left <= 0) resolve(true);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), frames);
}

/** Startet direkt in Kapitel 2 und wartet auf die WLAN-Liste. */
async function startChapter() {
  const g = await launchGame({ query: QUERY, readyTimeout: STATE_TIMEOUT });
  // Robust unter Last: großzügige Timeouts, und jede Eingabe ist verarbeitet, bevor es weitergeht
  const { waitFor, click, type, press } = g;
  g.waitFor = (fn, arg = null, { timeout = STATE_TIMEOUT } = {}) => waitFor(fn, arg, { timeout });
  g.click = async (...args) => {
    await click(...args);
    await settle(g);
  };
  g.type = async (...args) => {
    await type(...args);
    await settle(g);
  };
  g.press = async (...args) => {
    await press(...args);
    await settle(g);
  };
  await g.waitFor((key) => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    return Boolean(scene && scene.sys.settings.key === key && scene.getDebugInfo().page === 'list');
  }, CHAPTER_KEY);
  return g;
}

/** getDebugInfo() der Kapitel-Szene. */
function info(g) {
  return g.eval(() => window.__EDU_DEBUG.getChapterScene().getDebugInfo());
}

/**
 * Wartet, bis `predicate(debugInfo, arg)` im Browser true liefert.
 * @param {object} g
 * @param {Function} predicate wird als Quelltext übertragen (keine Closures!)
 */
function until(g, predicate, arg = null, { timeout = STATE_TIMEOUT } = {}) {
  return g.waitFor(({ source, value }) => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    if (!scene || typeof scene.getDebugInfo !== 'function') return false;
    // eslint-disable-next-line no-new-func
    const check = new Function(`return (${source});`)();
    return Boolean(check(scene.getDebugInfo(), value));
  }, { source: predicate.toString(), value: arg }, { timeout });
}

/** Klick auf ein benanntes Ziel der aktuellen Handy-Seite. */
async function tap(g, name) {
  const debugInfo = await info(g);
  const target = debugInfo.targets[name];
  assert(target, `Klickziel „${name}“ fehlt (Seite ${debugInfo.page})`);
  await g.click(target.x, target.y);
}

/** Aktueller Wert eines Feldes im Dialog. */
function fieldValue(g, field) {
  return g.eval((name) => window.__EDU_DEBUG.getChapterScene().fields[name].getValue(), field);
}

/** Auswahlliste öffnen und Eintrag mit diesem Label anklicken; liefert den neuen Wert. */
async function selectOption(g, field, label) {
  await tap(g, field);
  await g.waitFor((name) => window.__EDU_DEBUG.getChapterScene().fields[name].isOpen(), field);
  const pos = await g.eval(({ name, text }) => {
    const dropdown = window.__EDU_DEBUG.getChapterScene().fields[name];
    const index = dropdown.getOptions().findIndex((option) => option.label === text);
    const bounds = index >= 0 ? dropdown.getOptionBounds(index) : null;
    return bounds ? { x: bounds.centerX, y: bounds.centerY } : null;
  }, { name: field, text: label });
  assert(pos, `Option „${label}“ in ${field} nicht gefunden`);
  await g.click(pos.x, pos.y);
  await g.waitFor((name) => !window.__EDU_DEBUG.getChapterScene().fields[name].isOpen(), field);
  return fieldValue(g, field);
}

/** Feld anklicken (wartet auf den Fokus) und tippen. */
async function typeInto(g, field, text) {
  await tap(g, field);
  await g.waitFor((name) => window.__EDU_DEBUG.getChapterScene().fields[name].isFocused(), field);
  await g.type(text);
}

/** Feld leeren (Cursor ans Ende, dann zeichenweise löschen – wie von Hand). */
async function clearField(g, field) {
  await tap(g, field);
  await g.waitFor((name) => window.__EDU_DEBUG.getChapterScene().fields[name].isFocused(), field);
  await g.press('End');
  const length = (await fieldValue(g, field)).length;
  for (let i = 0; i < length; i++) await g.page.keyboard.press('Backspace');
  await settle(g);
}

/** CAMPUS und das richtige Passwort aus dem Browser. */
function readFacts(g) {
  return g.eval(() => ({
    campus: JSON.parse(JSON.stringify(CAMPUS)),
    password: GameState.getCredentials().password,
  }));
}

/** eduroam antippen, bis der Dialog offen ist (altes Profil wird unterwegs entfernt). */
async function openConfig(g) {
  let debugInfo = await info(g);
  if (debugInfo.step === 'start') {
    await tap(g, 'eduroam');
    await until(g, (i) => i.step === 'old-profile' && !i.isBusy);
    debugInfo = await info(g);
  }
  if (!debugInfo.isOldProfileRemoved) {
    await tap(g, 'eduroam');
    await until(g, (i) => i.page === 'details');
    await tap(g, 'remove');
    await until(g, (i) => i.page === 'list' && i.isOldProfileRemoved);
  }
  await tap(g, 'eduroam');
  await until(g, (i) => i.page === 'config');
}

/** „Verbinden“ im Dialog und warten, bis das Ergebnis da ist. */
async function connect(g) {
  const before = (await info(g)).configAttempts;
  await tap(g, 'connect');
  await until(g, (i, n) => i.configAttempts === n + 1 && (!i.isBusy || i.step === 'connected'), before, { timeout: STATE_TIMEOUT });
  return info(g);
}

/** HUD-Button (Spielkoordinaten) anklicken. */
async function clickHud(g, id) {
  const center = await g.eval((buttonId) => window.__EDU_DEBUG.game.scene.getScene('HUD').getButtonCenter(buttonId), id);
  assert(center, `HUD-Button „${id}“ nicht gefunden`);
  await g.click(center.x, center.y);
}

/** Identität tippen wie ein aufmerksamer Mensch: Autokorrektur „lehrer.“ sofort zurücknehmen. */
async function typeIdentityCarefully(g, campus) {
  const realmWord = campus.realm.split('.')[0];
  await typeInto(g, 'identity', `${campus.username}@${realmWord}.`);
  const value = await fieldValue(g, 'identity');
  if (value !== `${campus.username}@${realmWord}.`) {
    await g.press('Backspace');
    await g.press('Backspace');
    await g.type('.');
  }
  await g.type(campus.realm.slice(realmWord.length + 1));
  assert((await fieldValue(g, 'identity')) === campus.identity, `Identität: ${await fieldValue(g, 'identity')}`);
}

/**
 * Frust, den das Kapitel selbst gebucht hat (ohne Uhr-Meilensteine, die an der Testdauer
 * hängen): { gross: Summe der Erhöhungen, net: abzüglich „Geschafft“ }.
 */
function chapterFrustration(g) {
  return g.eval(() => {
    const entries = window.__EDU_DEBUG.events.filter((entry) => entry.event === 'frustration-changed'
      && entry.payload.reason !== 'milestone' && entry.payload.reason !== 'debug');
    const gross = entries.filter((entry) => entry.payload.delta > 0).reduce((sum, entry) => sum + entry.payload.delta, 0);
    const relief = entries.filter((entry) => entry.payload.delta < 0).reduce((sum, entry) => sum - entry.payload.delta, 0);
    return { gross, net: gross - relief };
  });
}

/** Summe der Zeitstrafen (CLOCK_JUMP) in Spielminuten. */
function penaltyMinutes(g) {
  return g.eval(() => window.__EDU_DEBUG.events
    .filter((entry) => entry.event === 'clock-jump' && entry.payload.reason !== 'debug')
    .reduce((sum, entry) => sum + entry.payload.minutes, 0));
}

// ---------------------------------------------------------------------------
// 1. Happy Path
// ---------------------------------------------------------------------------

await test('Kapitel 2 – Happy Path mit echten Eingaben (erster Versuch, anonym)', async () => {
  const g = await startChapter();
  try {
    const { campus, password } = await readFacts(g);
    await g.shot('ch2-01-list');

    // Altes Profil: Android probiert es ungefragt → kein Fehlversuch, aber etwas Frust
    await tap(g, 'eduroam');
    await until(g, (i) => i.step === 'old-profile' && !i.isBusy);
    let state = await g.state();
    assert(state.totalFails === 0, `Altprofil darf kein Fehlversuch sein (totalFails ${state.totalFails})`);
    assert(state.frustration > 0, 'Altprofil kostet ein bisschen Frust');
    assert((await info(g)).eduroamStatus === 'Authentifizierungsproblem', 'Status Authentifizierungsproblem');
    await g.shot('ch2-02-old-profile');

    await tap(g, 'eduroam');
    await until(g, (i) => i.page === 'details');
    await g.shot('ch2-03-details');
    await tap(g, 'remove');
    await until(g, (i) => i.page === 'list' && i.isOldProfileRemoved);
    await tap(g, 'eduroam');
    await until(g, (i) => i.page === 'config');
    await g.shot('ch2-04-config-empty');

    // Auswahllisten
    assert((await fieldValue(g, 'eapMethod')) === campus.wifi.eapMethod, 'EAP-Methode steht schon richtig');
    assert((await selectOption(g, 'phase2', campus.wifi.phase2)) === campus.wifi.phase2, 'Phase 2 gewählt');
    await tap(g, 'caCert');
    await g.wait(250);
    await g.shot('ch2-05-ca-list');
    await g.press('Escape');
    assert((await selectOption(g, 'caCert', campus.wifi.caCertOption)) === campus.wifi.caCertOption, 'CA gewählt');

    // Domain und Identität (Autokorrektur macht aus „@lehre.“ ein „@lehrer.“)
    await typeInto(g, 'domain', campus.wifi.domain);
    assert((await fieldValue(g, 'domain')) === campus.wifi.domain, 'Domain getippt');
    const realmWord = campus.realm.split('.')[0];
    await typeInto(g, 'identity', `${campus.username}@${realmWord}.`);
    const corrected = await fieldValue(g, 'identity');
    assert(corrected === `${campus.username}@${realmWord}r.`, `Autokorrektur erwartet, Feld: ${corrected}`);
    await g.shot('ch2-06-autocorrect');
    await g.press('Backspace');
    await g.press('Backspace');
    await g.type(campus.realm.slice(realmWord.length));
    assert((await fieldValue(g, 'identity')) === campus.identity, 'Identität korrigiert');

    await typeInto(g, 'anonymousIdentity', campus.anonymousIdentity);
    assert((await fieldValue(g, 'anonymousIdentity')) === campus.anonymousIdentity, 'anonyme Identität');

    // Passwort: Tastatur springt auf EN → zurückstellen, dann tippen
    await tap(g, 'password');
    let debugInfo = await info(g);
    assert(debugInfo.hasKeyboardTrolled && debugInfo.keyboardLayout === 'en', 'Tastatur steht plötzlich auf EN');
    await g.shot('ch2-07-keyboard-en');
    await tap(g, 'keyboard');
    assert((await info(g)).keyboardLayout === 'de', 'Tastatur wieder DE');
    await tap(g, 'password');
    await g.type(password);
    assert((await fieldValue(g, 'password')) === password, 'Passwort korrekt getippt');
    await g.shot('ch2-08-config-filled');

    debugInfo = await connect(g);
    assert(debugInfo.step === 'connected', `verbunden erwartet, war ${debugInfo.step} (${JSON.stringify(debugInfo.lastResult)})`);
    await g.wait(1200);
    await g.shot('ch2-09-connected');

    await g.waitFor(() => Boolean(window.__EDU_DEBUG.getState().chapterStats[2]), null, { timeout: STATE_TIMEOUT });
    state = await g.state();
    assert(state.runAchievements.includes('FIRST_TRY_CONFIG'), `FIRST_TRY_CONFIG fehlt: ${state.runAchievements}`);
    assert(state.runAchievements.includes('ANON_IDENTITY'), `ANON_IDENTITY fehlt: ${state.runAchievements}`);
    assert(state.totalFails === 0, `keine Fehlversuche erwartet (${state.totalFails})`);
    assert(state.chapterStats[2].configAttempts === 1, 'ein Verbindungsversuch');
    await g.waitFor(() => window.__EDU_DEBUG.getState().currentChapterId === 3, null, { timeout: STATE_TIMEOUT });
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ---------------------------------------------------------------------------
// 2. Fehlerpfad
// ---------------------------------------------------------------------------

await test('Kapitel 2 – Fehlerpfad: stur, Merkblatt blind, Mitleids-Tipps, keine Sackgasse', async () => {
  const g = await startChapter();
  try {
    const { campus, password } = await readFacts(g);

    // Altes Profil zweimal stur „Verbinden“ → Mitleids-Tipp „Entfernen“
    await tap(g, 'eduroam');
    await until(g, (i) => i.step === 'old-profile' && !i.isBusy);
    for (let attempt = 1; attempt <= 2; attempt++) {
      await tap(g, 'eduroam');
      await until(g, (i) => i.page === 'details');
      await tap(g, 'connect');
      await until(g, (i, n) => i.oldProfileAttempts === n + 1 && !i.isBusy, attempt);
    }
    let state = await g.state();
    assert(state.totalFails === 2, `2 Fehlversuche erwartet (${state.totalFails})`);
    let debugInfo = await info(g);
    assert(debugInfo.pityTip && debugInfo.pityTip.includes('Entfernen'), `Tipp zum Entfernen erwartet: ${debugInfo.pityTip}`);
    await g.shot('ch2-10-tip-old-profile');

    // Merkblatt blind abgetippt: Phase 2 ok, kein CA, Kennung ohne Realm, Passwort mit EN-Tastatur
    await openConfig(g);
    await selectOption(g, 'phase2', campus.wifi.phase2);
    await typeInto(g, 'identity', campus.username);
    await typeInto(g, 'password', password);
    debugInfo = await connect(g);
    assert(debugInfo.lastResult.code === 'CA_MISSING' && debugInfo.eduroamStatus === 'Gespeichert', `CA_MISSING erwartet: ${JSON.stringify(debugInfo.lastResult)}`);
    assert(debugInfo.fieldErrors.caCert, 'Feldfehler am CA-Zertifikat');
    state = await g.state();
    assert(state.totalFails === 3, `3 Fehlversuche (${state.totalFails})`);

    // Dialog wieder öffnen: Werte bleiben, Fehler steht am Feld
    await tap(g, 'eduroam');
    await until(g, (i) => i.page === 'config');
    assert((await fieldValue(g, 'identity')) === campus.username, 'Werte bleiben erhalten');
    await g.shot('ch2-11-field-error');

    // „Nicht validieren“ ist gesperrt → Liste bleibt offen, Toast erklärt es
    await tap(g, 'caCert');
    const blocked = await g.eval(() => {
      const dropdown = window.__EDU_DEBUG.getChapterScene().fields.caCert;
      const index = dropdown.getOptions().findIndex((option) => option.label === 'Nicht validieren');
      const bounds = dropdown.getOptionBounds(index);
      return { x: bounds.centerX, y: bounds.centerY };
    });
    await g.click(blocked.x, blocked.y);
    assert(await g.eval(() => window.__EDU_DEBUG.getChapterScene().fields.caCert.isOpen()), 'Liste bleibt offen');
    await g.shot('ch2-12-no-validate');
    await g.press('Escape');

    // CA gewählt, aber Domain vergessen → wieder „Gespeichert“ → Tipp zur Domain
    await selectOption(g, 'caCert', campus.wifi.caCertOption);
    debugInfo = await connect(g);
    assert(debugInfo.lastResult.code === 'DOMAIN_MISSING', `DOMAIN_MISSING erwartet: ${debugInfo.lastResult.code}`);
    assert(debugInfo.pityTip && debugInfo.pityTip.includes(campus.certificate.serverName), 'Tipp nennt den Servernamen');
    await g.shot('ch2-13-tip-domain');

    // Domain rein → Kennung ohne Realm → Authentifizierungsproblem (Stempel)
    await tap(g, 'eduroam');
    await until(g, (i) => i.page === 'config');
    await typeInto(g, 'domain', campus.wifi.domain);
    await tap(g, 'connect');
    await until(g, (i) => !i.isBusy && i.lastResult && i.lastResult.code === 'IDENTITY_NO_REALM', null, { timeout: STATE_TIMEOUT });
    await g.wait(250);
    await g.shot('ch2-14-auth-problem');
    debugInfo = await info(g);
    assert(debugInfo.eduroamStatus === 'Authentifizierungsproblem' && debugInfo.stampsShown === 1, 'Stempel beim Auth-Fehler');

    // Volle Identität tippen → Autokorrektur schlägt zu → falscher Realm
    await tap(g, 'eduroam');
    await until(g, (i) => i.page === 'config');
    await clearField(g, 'identity');
    await g.type(campus.identity);
    assert((await fieldValue(g, 'identity')) !== campus.identity, 'Autokorrektur hat zugeschlagen');
    debugInfo = await connect(g);
    assert(debugInfo.lastResult.code === 'IDENTITY_REALM', `IDENTITY_REALM erwartet: ${debugInfo.lastResult.code}`);
    assert(debugInfo.pityTip && debugInfo.pityTip.includes(campus.realm), 'Tipp zum Realm (2. Fehler Identität)');

    // Tastatur endlich zurück auf DE (gelbe Leiste), Identität neu → Passwort war noch mit EN
    // getippt → PASSWORD_LAYOUT (falls es y/z/Umlaute/Bindestrich enthält)
    await tap(g, 'eduroam');
    await until(g, (i) => i.page === 'config');
    await g.shot('ch2-15-keyboard-still-en');
    await tap(g, 'keyboard');
    assert((await info(g)).keyboardLayout === 'de', 'Tastatur wieder DE');
    const typedDomain = await fieldValue(g, 'domain');
    assert(typedDomain.includes('/'), `Domain wurde unter EN getippt („-“ → „/“): ${typedDomain}`);
    await clearField(g, 'domain');
    await g.type(campus.wifi.domain);
    await clearField(g, 'identity');
    await g.type(campus.identity);
    assert((await fieldValue(g, 'identity')) === campus.identity, 'Identität jetzt richtig');
    assert((await fieldValue(g, 'domain')) === campus.wifi.domain, 'Domain jetzt richtig');
    debugInfo = await connect(g);
    if (/[yzäöüß-]/i.test(password)) {
      assert(debugInfo.lastResult.code === 'PASSWORD_LAYOUT', `PASSWORD_LAYOUT erwartet: ${debugInfo.lastResult.code}`);
      assert(/English/.test(debugInfo.pityTip || ''), 'ab dem 4. Fehler kommt immer ein Tipp');
      await tap(g, 'eduroam');
      await until(g, (i) => i.page === 'config');
      await clearField(g, 'password');
      await g.type(password);
      debugInfo = await connect(g);
    }
    assert(debugInfo.step === 'connected', `am Ende verbunden: ${JSON.stringify(debugInfo.lastResult)}`);

    await g.waitFor(() => Boolean(window.__EDU_DEBUG.getState().chapterStats[2]), null, { timeout: STATE_TIMEOUT });
    state = await g.state();
    assert(!state.runAchievements.includes('FIRST_TRY_CONFIG'), 'kein FIRST_TRY_CONFIG nach Fehlern');
    assert(!state.runAchievements.includes('ANON_IDENTITY'), 'kein ANON_IDENTITY ohne anonyme Identität');
    assert(state.totalFails >= 6, `viele Fehlversuche erwartet (${state.totalFails})`);
    // Frust, den das Kapitel selbst verursacht (ohne Uhr-Meilensteine – die hängen an der Testdauer)
    const chapterFrustration = await g.eval(() => window.__EDU_DEBUG.events
      .filter((entry) => entry.event === 'frustration-changed' && entry.payload.reason !== 'milestone' && entry.payload.delta > 0)
      .reduce((sum, entry) => sum + entry.payload.delta, 0));
    assert(chapterFrustration >= 25, `schludriger Lauf: ${chapterFrustration} % Frust`);
    assert(chapterFrustration <= 45, `aber kein Rage-Quit-Niveau: ${chapterFrustration} %`);
    assert(state.frustration < 100, 'kein Rage-Quit');
    console.log(`      Fehlerpfad: ${state.totalFails} Fehlversuche, ${chapterFrustration} % Kapitel-Frust, Spitze ${state.frustrationPeak} %, Uhr ${state.clockLabel}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ---------------------------------------------------------------------------
// 3. Balance: „normaler“ Lauf mit zwei typischen Fehlern
// ---------------------------------------------------------------------------

await test('Kapitel 2 – Balance: normaler Lauf (Domain vergessen, EN-Tastatur) → 8–12 % Frust', async () => {
  const g = await startChapter();
  try {
    const startedAt = Date.now();
    const { campus, password } = await readFacts(g);
    await openConfig(g); // Android probiert das alte Profil, dann „Entfernen“
    await selectOption(g, 'phase2', campus.wifi.phase2);
    await selectOption(g, 'caCert', campus.wifi.caCertOption);
    await typeIdentityCarefully(g, campus);
    await typeInto(g, 'anonymousIdentity', campus.anonymousIdentity);
    // Typischer Fehler: Passwort sofort tippen, obwohl die Tastatur auf EN gesprungen ist …
    await typeInto(g, 'password', password);
    // … und die Domain vergessen → nur „Gespeichert“ mit Feldfehler
    let debugInfo = await connect(g);
    assert(debugInfo.lastResult.code === 'DOMAIN_MISSING', `DOMAIN_MISSING erwartet: ${debugInfo.lastResult.code}`);
    assert(debugInfo.fieldErrors.domain, 'Feldfehler an der Domain');

    await tap(g, 'eduroam');
    await until(g, (i) => i.page === 'config');
    await g.shot('ch2-21-balance-domain-error');
    await tap(g, 'keyboard'); // die gelbe Leiste fällt jetzt auf: zurück auf DE …
    await typeInto(g, 'domain', campus.wifi.domain);
    debugInfo = await connect(g);
    if (/[yzäöüß-]/i.test(password)) {
      // … aber das Passwort war schon unter EN getippt
      assert(debugInfo.lastResult.code === 'PASSWORD_LAYOUT', `PASSWORD_LAYOUT erwartet: ${debugInfo.lastResult.code}`);
      await tap(g, 'eduroam');
      await until(g, (i) => i.page === 'config');
      await clearField(g, 'password');
      await g.type(password);
      debugInfo = await connect(g);
    }
    assert(debugInfo.step === 'connected', `verbunden erwartet: ${JSON.stringify(debugInfo.lastResult)}`);
    await g.waitFor(() => Boolean(window.__EDU_DEBUG.getState().chapterStats[2]), null, { timeout: STATE_TIMEOUT });

    const state = await g.state();
    const frust = await chapterFrustration(g);
    const minutes = await penaltyMinutes(g);
    console.log(`      Balance normal: ${frust.net} % Kapitel-Frust (brutto ${frust.gross} %), ${state.totalFails} Fehlversuche, `
      + `+${minutes} min Strafe, Uhr ${state.clockLabel}, Bot-Dauer ${Math.round((Date.now() - startedAt) / 1000)} s`);
    assert(frust.net >= 8 && frust.net <= 12, `normaler Lauf: ${frust.net} % (Ziel 8–12 %)`);
    assert(minutes <= 5, `Zeitstrafen moderat: +${minutes} min`);
    assert(state.runAchievements.includes('ANON_IDENTITY'), 'ANON_IDENTITY trotz Fehlversuchen');
    assert(!state.runAchievements.includes('FIRST_TRY_CONFIG'), 'kein FIRST_TRY_CONFIG');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ---------------------------------------------------------------------------
// 4. Nachbarnetze und Play Store
// ---------------------------------------------------------------------------

await test('Kapitel 2 – Nachbarnetze und Play Store: Witze, einmalige Zeitstrafe, kein Fehlversuch', async () => {
  const g = await startChapter();
  try {
    // Zeitstrafen über CLOCK_JUMP zählen – die Uhr läuft nebenbei in Echtzeit weiter
    const guestJumps = () => g.eval(() => window.__EDU_DEBUG.events
      .filter((entry) => entry.event === 'clock-jump' && /Gast-Portal/.test(entry.payload.reason || '')).length);
    const startMinutes = (await g.state()).clockMinutes;
    await tap(g, 'guest');
    await g.waitFor(() => UI.Modal.isAnyOpen(window.__EDU_DEBUG.getChapterScene()));
    await g.wait(300);
    await g.shot('ch2-16-guest-modal');
    await g.press('Escape');
    await g.waitFor(() => !UI.Modal.isAnyOpen(window.__EDU_DEBUG.getChapterScene()));
    const afterGuest = (await g.state()).clockMinutes;
    assert(afterGuest - startMinutes >= 2, `Gast-Portal kostet Zeit (${afterGuest - startMinutes} min)`);

    for (const id of ['kevin', 'fritz', 'printer', 's21']) await tap(g, id);
    await g.shot('ch2-17-neighbour-toasts');

    await tap(g, 'playStore');
    await g.waitFor(() => UI.Modal.isAnyOpen(window.__EDU_DEBUG.getChapterScene()));
    await g.wait(300);
    await g.shot('ch2-18-play-store');
    await g.press('Escape');
    await g.waitFor(() => !UI.Modal.isAnyOpen(window.__EDU_DEBUG.getChapterScene()));

    // Zweimal Gast-Portal kostet nur einmal Zeit
    assert((await guestJumps()) === 1, 'eine Zeitstrafe fürs Gast-Portal');
    await tap(g, 'guest');
    await g.waitFor(() => UI.Modal.isAnyOpen(window.__EDU_DEBUG.getChapterScene()));
    await g.press('Escape');
    await g.waitFor(() => !UI.Modal.isAnyOpen(window.__EDU_DEBUG.getChapterScene()));
    assert((await guestJumps()) === 1, 'Zeitstrafe nur beim ersten Mal');
    const playStoreJumps = await g.eval(() => window.__EDU_DEBUG.events
      .filter((entry) => entry.event === 'clock-jump' && /Play Store/.test(entry.payload.reason || '')).length);
    assert(playStoreJumps === 1, `Play Store kostet einmal Zeit (${playStoreJumps}×)`);

    const state = await g.state();
    assert(state.totalFails === 0, 'Witze sind keine Fehlversuche');
    assert((await info(g)).step === 'start', 'eduroam unverändert');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ---------------------------------------------------------------------------
// 5. debugSolve
// ---------------------------------------------------------------------------

await test('Kapitel 2 – debugSolve mitten im Verbinden', async () => {
  const g = await startChapter();
  try {
    await tap(g, 'eduroam');
    await until(g, (i) => i.isBusy && i.step === 'connecting');
    await g.eval(() => window.__EDU_DEBUG.solve());
    await until(g, (i) => i.isFinished && i.step === 'connected');
    await g.waitFor(() => Boolean(window.__EDU_DEBUG.getState().chapterStats[2]), null, { timeout: STATE_TIMEOUT });
    const state = await g.state();
    assert(state.chapterStats[2].solvedBy === 'debug', 'als Debug-Lösung markiert');
    assert(state.totalFails === 0, 'keine Fehlversuche durch Timer nach debugSolve');
    await g.waitFor(() => window.__EDU_DEBUG.getState().currentChapterId === 3, null, { timeout: STATE_TIMEOUT });
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await test('Kapitel 2 – debugSolve mit offener Auswahlliste und fokussiertem Feld', async () => {
  const g = await startChapter();
  try {
    await openConfig(g);
    await tap(g, 'identity');
    await g.type('wwi');
    await tap(g, 'caCert');
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().fields.caCert.isOpen());
    await g.eval(() => window.__EDU_DEBUG.solve());
    await until(g, (i) => i.isFinished);
    const isListGone = await g.eval(() => !UI.Dropdown.isAnyOpen(window.__EDU_DEBUG.getChapterScene()));
    assert(isListGone, 'Auswahlliste nach debugSolve geschlossen');
    await g.wait(300);
    await g.shot('ch2-19-debug-solved');
    await g.waitFor(() => window.__EDU_DEBUG.getState().currentChapterId === 3, null, { timeout: STATE_TIMEOUT });
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ---------------------------------------------------------------------------
// 6. Pause/Weiter
// ---------------------------------------------------------------------------

await test('Kapitel 2 – Pause/Weiter: Verbinden und Tippen ruhen in der Pause', async () => {
  const g = await startChapter();
  try {
    // Pause mitten im Verbindungsversuch
    await tap(g, 'eduroam');
    await until(g, (i) => i.isBusy && i.step === 'connecting');
    await clickHud(g, 'pause');
    await g.waitFor((key) => window.__EDU_DEBUG.game.scene.isPaused(key), CHAPTER_KEY);
    assert((await g.state()).paused === true, 'GameState pausiert');
    await g.wait(3000);
    assert((await info(g)).step === 'connecting', 'Verbindungs-Timer ruhen in der Pause');
    await g.shot('ch2-20-paused');
    await clickHud(g, 'resume');
    await g.waitFor((key) => window.__EDU_DEBUG.game.scene.isActive(key), CHAPTER_KEY);
    await until(g, (i) => i.step === 'old-profile' && !i.isBusy);

    // Pause beim Tippen: Tasten erreichen das Feld nicht
    await openConfig(g);
    await typeInto(g, 'identity', 'ab');
    await clickHud(g, 'pause');
    await g.waitFor((key) => window.__EDU_DEBUG.game.scene.isPaused(key), CHAPTER_KEY);
    await g.type('cd');
    assert((await fieldValue(g, 'identity')) === 'ab', 'in der Pause wird nicht getippt');
    await clickHud(g, 'resume');
    await g.waitFor((key) => window.__EDU_DEBUG.game.scene.isActive(key), CHAPTER_KEY);
    await typeInto(g, 'identity', 'cd');
    assert((await fieldValue(g, 'identity')) === 'abcd', `nach der Pause geht es weiter: ${await fieldValue(g, 'identity')}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// ---------------------------------------------------------------------------
// 7. Kapitel neu starten (HUD) setzt alles zurück
// ---------------------------------------------------------------------------

await test('Kapitel 2 – „Kapitel neu starten“ beginnt sauber von vorn', async () => {
  const g = await startChapter();
  try {
    await openConfig(g);
    await typeInto(g, 'identity', 'wwi');
    await clickHud(g, 'pause');
    await g.waitFor((key) => window.__EDU_DEBUG.game.scene.isPaused(key), CHAPTER_KEY);
    await clickHud(g, 'restart');
    await g.waitFor((key) => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      return Boolean(scene && scene.sys.settings.key === key && scene.sys.isActive() && scene.getDebugInfo().page === 'list');
    }, CHAPTER_KEY);
    const debugInfo = await info(g);
    assert(debugInfo.step === 'start' && !debugInfo.isOldProfileRemoved, `frischer Zustand erwartet: ${debugInfo.step}`);
    assert(debugInfo.config.identity === '' && debugInfo.configAttempts === 0, 'Dialogwerte zurückgesetzt');
    await tap(g, 'eduroam');
    await until(g, (i) => i.step === 'old-profile' && !i.isBusy);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});
