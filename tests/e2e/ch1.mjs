/**
 * ch1.mjs – Browser-Tests für Kapitel 1 „Die Registrierung“ (Ch1RegistrationScene).
 *
 * 1. Happy Path mit echten Klicks und Tastatureingaben: Login → CAPTCHA (Runde 1 scheitert
 *    immer) → Nutzungsordnung (scrollen, Geheimwort) → Passwort-Regeln Zeichen für Zeichen →
 *    Wiederholen → Synchronisation (Neu laden + F5) → Kapitel abgeschlossen, drei Erfolge.
 * 2. Fehlerpfad: Kennung mit Realm, verwechselte Zeichen, Kopierer-Rettung, falsche
 *    CAPTCHA-Auswahl bis zu den Bildbeschreibungen, Überraschungsregel, falsche
 *    Wiederholung, 24 Stunden warten – Fehlversuche und Frust steigen, nie eine Sackgasse.
 * 3. debugSolve(): löst das Kapitel, setzt gültige Zugangsdaten.
 * 4. Pause/Weiter: pausiertes Kapitel nimmt keine Eingaben an, danach geht es weiter.
 * Screenshots: screenshots/ch1-*.png. Klickziele liefert getDebugInfo().targets.
 *
 * Aufruf: node tests/e2e/ch1.mjs
 */
import { launchGame, runTest, assert } from './harness.mjs';

const QUERY = 'chapter=1&skipintro=1&seed=7';
/** Optional: E2E_IGNORE="datei1.js,datei2.js" ignoriert Browser-Fehler aus fremden Baustellen. */
const IGNORE_ERRORS = (process.env.E2E_IGNORE || '').split(',').map((s) => s.trim()).filter(Boolean);
const STEP_TIMEOUT = 15000;
const TILE_FADE_MS = 650;  // Kacheln blenden gestaffelt ein
const MODAL_OPEN_MS = 350; // Dialog skaliert beim Öffnen
const VALID_PASSWORD = 'Brezel!WWI26A94';
/** Spielstart 07:30 in Minuten (wie CONFIG.CLOCK.START_MINUTES) – für die Balance-Messung. */
const CLOCK_START = 7 * 60 + 30;

/** Minuten → „HH:MM“ (für Log-Ausgaben). */
function fmtClock(minutes) {
  const m = Math.round(minutes);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Debug-Zustand von Kapitel 1 (oder null). */
function info(g) {
  return g.eval(() => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    return scene && scene.sys.settings.key === 'Ch1Registration' ? scene.getDebugInfo() : null;
  });
}

/** Wartet, bis eine Station fertig geladen ist. */
async function waitStep(g, step) {
  await g.waitFor((s) => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    const d = scene && scene.sys.settings.key === 'Ch1Registration' && scene.getDebugInfo();
    return Boolean(d && d.step === s && !d.isLoading);
  }, step, { timeout: STEP_TIMEOUT });
  await g.wait(150);
}

/** Klick auf ein Ziel aus getDebugInfo().targets (optional mit Index, z. B. Kacheln). */
async function clickTarget(g, name, index = null) {
  const d = await info(g);
  let target = d && d.targets[name];
  if (index !== null && target) target = target[index];
  assert(target, `Klickziel „${name}${index !== null ? `[${index}]` : ''}“ vorhanden`);
  await g.click(target.x, target.y);
}

/** Feld anklicken, Inhalt ersetzen (Strg+A markiert alles) und tippen. */
async function typeInto(g, name, text) {
  await clickTarget(g, name);
  await g.press('Control+A');
  await g.press('Backspace');
  await g.type(text);
  await g.wait(80);
}

async function getCampus(g) {
  return g.eval(() => ({
    username: CAMPUS.username, identity: CAMPUS.identity, initialPassword: CAMPUS.initialPassword, course: CAMPUS.course,
  }));
}

/** Robot-Häkchen setzen und warten, bis das Bilderrätsel offen ist. */
async function openCaptcha(g) {
  await clickTarget(g, 'robot');
  await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().getDebugInfo().captchaOpen === true, null, { timeout: 5000 });
  await g.wait(TILE_FADE_MS);
}

/** Wählt die angegebenen Kacheln und bestätigt; wartet auf die nächste Runde bzw. Erfolg. */
async function answerCaptcha(g, indices) {
  const before = await info(g);
  for (const index of indices) await clickTarget(g, 'tiles', index);
  await clickTarget(g, 'captchaConfirm');
  await g.waitFor((round) => {
    const d = window.__EDU_DEBUG.getChapterScene().getDebugInfo();
    return d.captchaPassed || d.captchaRound > round;
  }, before.captchaRound, { timeout: 5000 });
  await g.wait(TILE_FADE_MS);
  return info(g);
}

/** Scrollt die Nutzungsordnung per Mausrad bis zum Ende. */
async function scrollTermsToEnd(g) {
  const d = await info(g);
  for (let i = 0; i < 40; i += 1) {
    await g.wheel(d.targets.tosPanel.x, d.targets.tosPanel.y, 600);
    const now = await info(g);
    if (now.tosUnlocked) return now;
  }
  throw new Error('Nutzungsordnung ließ sich nicht bis zum Ende scrollen');
}

/** Klickt den n-ten Button im obersten Dialog. */
async function clickModalButton(g, index) {
  await g.wait(MODAL_OPEN_MS);
  await clickTarget(g, 'modalButtons', index);
}

async function waitChapterComplete(g) {
  await g.waitFor(() => window.__EDU_DEBUG.events.some((e) => e.event === 'chapter-complete' && e.payload && e.payload.chapterId === 1),
    null, { timeout: STEP_TIMEOUT });
}

// =============================================================================

await runTest('ch1: Happy Path mit echten Eingaben (drei Erfolge, Kapitel abgeschlossen)', async () => {
  const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
  try {
    const campus = await getCampus(g);
    await waitStep(g, 'login');
    await g.shot('ch1-login');

    // --- Station 1: Login --------------------------------------------------
    await typeInto(g, 'username', campus.username);
    await typeInto(g, 'password', campus.initialPassword);
    await g.press('Enter');
    await waitStep(g, 'captcha');
    let state = await g.state();
    assert(state.totalFails === 0, `kein Fehlversuch beim Login (totalFails ${state.totalFails})`);

    // --- Station 2: CAPTCHA ------------------------------------------------
    await g.shot('ch1-captcha-start');
    await openCaptcha(g);
    let d = await info(g);
    assert(d.captchaTargets.length >= 3, 'mindestens drei Access Points im Raster');
    await g.shot('ch1-captcha-grid');
    const frustBefore = state.frustration;
    d = await answerCaptcha(g, d.captchaTargets); // richtig – scheitert trotzdem (Runde 1)
    state = await g.state();
    assert(!d.captchaPassed && d.captchaRound === 2, `Runde 1 scheitert immer (Runde ${d.captchaRound})`);
    assert(d.captchaErrors === 0, 'richtige Auswahl zählt nicht als Spielerfehler');
    assert(state.totalFails === 0, 'Pflicht-Fehlschlag ist kein Fehlversuch');
    assert(state.frustration > frustBefore, 'Pflicht-Fehlschlag nervt trotzdem ein bisschen');
    assert(/erste Versuch/.test(d.tip), `Post-it beruhigt („${d.tip}“)`);
    await g.shot('ch1-captcha-retry');
    d = await answerCaptcha(g, d.captchaTargets);
    assert(d.captchaPassed, 'Runde 2 mit richtiger Auswahl bestanden');
    await waitStep(g, 'tos');

    // --- Station 3: Nutzungsordnung -----------------------------------------
    await g.shot('ch1-tos');
    await clickTarget(g, 'accept'); // gesperrt
    d = await info(g);
    assert(d.step === 'tos' && !d.tosUnlocked, '„Akzeptieren“ ist vor dem Ende gesperrt');
    d = await scrollTermsToEnd(g);
    assert(d.tosProgress >= 0.98, `bis zum Ende gescrollt (${d.tosProgress})`);
    await typeInto(g, 'remarks', d.secretWord);
    d = await info(g);
    assert(d.tosReader, `Geheimwort „${d.secretWord}“ erkannt`);
    await g.shot('ch1-tos-end');
    await clickTarget(g, 'accept');
    await g.wait(MODAL_OPEN_MS);
    await g.shot('ch1-tos-confirm');
    await clickModalButton(g, 1); // „Ja“
    await waitStep(g, 'password');

    // --- Station 4: Passwort (Zeichen für Zeichen) --------------------------
    await g.shot('ch1-password-start');
    await clickTarget(g, 'newPassword');
    await g.type('Brezel!', { delay: 30 });
    d = await info(g);
    assert(d.passwordRevealed >= 1 && d.passwordRevealed < 9, `Regeln erscheinen nacheinander (${d.passwordRevealed})`);
    await g.type('WWI26A', { delay: 30 });
    d = await info(g);
    assert(d.passwordRevealed === 7 && d.passwordFailing.includes('digitSum'), `Quersummen-Regel offen (${d.passwordRevealed}, ${d.passwordFailing})`);
    await g.shot('ch1-password-rules');
    await g.type('94', { delay: 30 });
    d = await info(g);
    assert(d.passwordComplete && d.passwordRevealed === 9, `alle neun Regeln erfüllt (${d.passwordFailing})`);
    assert(d.twistHits === 0, 'keine Überraschungsregel verletzt');
    await g.shot('ch1-password-done');
    await clickTarget(g, 'next');
    d = await info(g);
    assert(d.passwordPhase === 'confirm', 'Wiederholen-Feld sichtbar');
    await typeInto(g, 'confirm', VALID_PASSWORD);
    await g.shot('ch1-password-confirm');
    await clickTarget(g, 'save');
    await waitStep(g, 'sync');
    const credentials = await g.eval(() => GameState.getCredentials());
    assert(credentials.password === VALID_PASSWORD && !credentials.isDefault, 'Zugangsdaten in GameState gespeichert');
    assert(credentials.identity === campus.identity, 'Identität mit Realm');

    // --- Station 5: Synchronisation (Neu laden + F5) -------------------------
    await g.shot('ch1-sync');
    d = await info(g);
    const needed = d.syncNeeded;
    assert(needed >= 3 && needed <= 6, `3–6 Mal neu laden (${needed})`);
    let clock = (await g.state()).clockMinutes;
    await clickTarget(g, 'reload');
    await waitStep(g, 'sync');
    state = await g.state();
    assert(state.clockMinutes >= clock + 1, 'Neu laden kostet eine Minute');
    await g.shot('ch1-sync-reload');
    // F5 lädt die Portalseite neu – nicht das Spiel
    await g.eval(() => { window.__ch1Marker = 'noch da'; });
    await g.press('F5');
    await waitStep(g, 'sync');
    assert(await g.eval(() => window.__ch1Marker === 'noch da'), 'F5 hat das Spiel nicht neu geladen');
    d = await info(g);
    assert(d.syncReloads === 2, `F5 zählt als Neuladen (${d.syncReloads})`);
    while (!d.syncDone) {
      await clickTarget(g, 'reload');
      await waitStep(g, 'sync');
      d = await info(g);
    }
    assert(d.syncReloads === needed, `nach genau ${needed}× erledigt (${d.syncReloads})`);
    await g.wait(250);
    await g.shot('ch1-sync-done');
    await clickTarget(g, 'continue');
    await waitChapterComplete(g);
    state = await g.state();
    const ids = state.runAchievements.map((a) => (typeof a === 'string' ? a : a.id));
    for (const id of ['CAPTCHA_HUMAN', 'TOS_READER', 'PASSWORD_POET']) assert(ids.includes(id), `Erfolg ${id} (${ids})`);
    assert(state.chapterStats[1] && state.chapterStats[1].syncReloads === needed, 'Kapitel-Statistik gespeichert');
    assert(state.frustration <= 12, `vernünftiges Spiel bleibt im Frust-Budget (${state.frustration} %)`);
    await g.waitFor(() => window.__EDU_DEBUG.getState().currentChapterId === 2, null, { timeout: STEP_TIMEOUT });
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('ch1: Fehlerpfad – Fehlversuche, Mitleids-Tipps, Rettungswege, 24 h warten', async () => {
  const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
  try {
    const campus = await getCampus(g);
    await waitStep(g, 'login');

    // Kennung mit Realm (Lerneffekt: Kennung ≠ Identität)
    await typeInto(g, 'username', campus.identity);
    await typeInto(g, 'password', campus.initialPassword);
    await clickTarget(g, 'login');
    let d = await info(g);
    let state = await g.state();
    assert(d.loginFails === 1 && d.lastLoginCode === 'REALM_IN_USERNAME', `Realm erkannt (${d.lastLoginCode})`);
    assert(state.totalFails === 1 && state.frustration > 0, 'Fehlversuch erhöht totalFails und Frust');
    assert(d.tip.includes(campus.username), `Tipp nennt die Kennung („${d.tip}“)`);
    await g.shot('ch1-error-login-realm');

    // Zweimal verwechselte Zeichen → buchstabiert, dann Kopierer
    await typeInto(g, 'username', campus.username);
    await typeInto(g, 'password', 'lI1O0' + campus.initialPassword.slice(5));
    await g.press('Enter');
    d = await info(g);
    assert(d.lastLoginCode === 'CONFUSABLE' && /Null/.test(d.tip), `Mitleids-Tipp buchstabiert („${d.tip}“)`);
    await typeInto(g, 'password', 'Il10O' + campus.initialPassword.slice(5));
    await g.press('Enter');
    d = await info(g);
    assert(d.loginFails === 3 && /Kopierer/.test(d.tip), `Rettungsweg Kopierer angeboten („${d.tip}“)`);
    await g.shot('ch1-error-login-rescue');
    const clockBefore = (await g.state()).clockMinutes;
    await clickTarget(g, 'forgot');
    await g.shot('ch1-error-forgot-modal');
    await clickModalButton(g, 1);
    await g.wait(300);
    d = await info(g);
    assert(d.usedCopier, 'Kopierer benutzt');
    assert((await g.state()).clockMinutes >= clockBefore + 15, 'Kopierer kostet 15 Minuten');
    await g.shot('ch1-error-copier');
    await clickTarget(g, 'login');
    await waitStep(g, 'captcha');

    // CAPTCHA: dreimal falsch (nur Rauchmelder) → Bildbeschreibungen, dann richtig
    await openCaptcha(g);
    for (let i = 0; i < 3; i += 1) {
      d = await info(g);
      const decoy = d.captchaKinds.indexOf('smokeDetector');
      d = await answerCaptcha(g, [decoy]);
    }
    assert(d.captchaErrors === 3 && d.captchaLabels, `Bildbeschreibungen nach 3 Fehlern (${d.captchaErrors})`);
    await g.shot('ch1-error-captcha-labels');
    d = await answerCaptcha(g, d.captchaTargets);
    assert(d.captchaPassed, 'mit Bildbeschreibungen bestanden');
    await waitStep(g, 'tos');
    d = await scrollTermsToEnd(g);
    await clickTarget(g, 'accept');
    await clickModalButton(g, 0); // „Ja, unter Protest“
    await waitStep(g, 'password');

    // Überraschungsregel: langes Wort sprengt die Höchstlänge
    await clickTarget(g, 'newPassword');
    await g.type('Kehrwoche!WWI26A94', { delay: 15 });
    d = await info(g);
    assert(d.twistHits === 1 && d.passwordFailing.join() === 'maxLength', `Höchstlänge schlägt zu (${d.passwordFailing})`);
    assert(/Zeichen zu viel/.test(d.tip), `Klartext-Tipp zur Überraschungsregel („${d.tip}“)`);
    await g.shot('ch1-error-password-twist');
    await typeInto(g, 'newPassword', VALID_PASSWORD);
    await clickTarget(g, 'next');
    const failsBefore = (await g.state()).totalFails;
    await typeInto(g, 'confirm', 'Brezel!WWI26A49');
    await clickTarget(g, 'save');
    d = await info(g);
    assert(d.confirmFails === 1 && d.step === 'password', 'falsche Wiederholung abgelehnt');
    assert((await g.state()).totalFails === failsBefore + 1, 'falsche Wiederholung ist ein Fehlversuch');
    await g.shot('ch1-error-confirm');
    await typeInto(g, 'confirm', VALID_PASSWORD);
    await g.press('Enter');
    await waitStep(g, 'sync');

    // 24 Stunden warten (mit Rückfrage)
    const clock = (await g.state()).clockMinutes;
    await clickTarget(g, 'wait');
    await g.shot('ch1-error-wait-modal');
    await clickModalButton(g, 1);
    await g.wait(400);
    d = await info(g);
    state = await g.state();
    assert(d.waited24h && d.syncDone, '24 h gewartet, Synchronisation durch');
    assert(state.clockMinutes >= clock + 24 * 60, `Uhr +24 h (${clock} → ${state.clockMinutes})`);
    await g.shot('ch1-error-waited');
    await clickTarget(g, 'continue');
    await waitChapterComplete(g);
    state = await g.state();
    const ids = state.runAchievements.map((a) => (typeof a === 'string' ? a : a.id));
    assert(!ids.includes('CAPTCHA_HUMAN') && !ids.includes('PASSWORD_POET') && !ids.includes('TOS_READER'),
      `keine Kapitel-Erfolge beim Schludern (${ids})`);
    assert(state.totalFails >= 7, `Fehlversuche gezählt (${state.totalFails})`);
    assert(state.frustration >= 25, `Schludern kostet Nerven (${state.frustration} %)`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('ch1: debugSolve() löst das Kapitel und setzt gültige Zugangsdaten', async () => {
  const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
  try {
    await waitStep(g, 'login');
    await g.eval(() => window.__EDU_DEBUG.solve());
    const d = await info(g);
    assert(d.step === 'done' && d.isFinished, `Kapitel fertig (${d.step})`);
    await g.shot('ch1-debug-solved');
    await waitChapterComplete(g);
    const result = await g.eval(() => ({
      credentials: GameState.getCredentials(),
      valid: Ch1Logic.evaluatePassword(GameState.getCredentials().password, CAMPUS).allOk,
      state: window.__EDU_DEBUG.getState(),
    }));
    assert(!result.credentials.isDefault && result.valid, 'gültiges, gespeichertes Passwort');
    assert(result.state.totalFails === 0, 'debugSolve ohne Fehlversuche');
    await g.waitFor(() => window.__EDU_DEBUG.getState().currentChapterId === 2, null, { timeout: STEP_TIMEOUT });
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

/** Klickt einen Knopf im HUD bzw. im Pause-Overlay ('pause' | 'resume' | 'restart' | 'menu'). */
async function clickHud(g, id) {
  const center = await g.eval((buttonId) => window.__EDU_DEBUG.getScene('HUD').getButtonCenter(buttonId), id);
  assert(center, `HUD-Knopf „${id}“ vorhanden`);
  await g.click(center.x, center.y);
}

const chapterStatus = (g) => g.eval(() => window.__EDU_DEBUG.getSceneStatus('Ch1Registration'));

await runTest('ch1: Pause hält das Kapitel an (auch mitten im Laden), „Weiter“ setzt fort', async () => {
  const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
  try {
    const campus = await getCampus(g);
    await waitStep(g, 'login');
    await clickTarget(g, 'username');
    await g.type('wwi');
    await clickHud(g, 'pause');
    await g.waitFor(() => window.__EDU_DEBUG.getSceneStatus('Ch1Registration') === 'paused');
    await g.type('xyz');
    const valueWhilePaused = await g.eval(() => window.__EDU_DEBUG.getChapterScene().usernameInput.getValue());
    assert(valueWhilePaused === 'wwi', `pausiert keine Eingaben („${valueWhilePaused}“)`);
    await g.shot('ch1-paused');
    await clickHud(g, 'resume');
    await g.waitFor(() => window.__EDU_DEBUG.getSceneStatus('Ch1Registration') === 'running');
    await clickTarget(g, 'username');
    await g.type('26042');
    const value = await g.eval(() => window.__EDU_DEBUG.getChapterScene().usernameInput.getValue());
    assert(value === campus.username, `nach „Weiter“ geht es normal weiter („${value}“)`);

    // Pause mitten im EDGE-Ladevorgang: Die Seite bleibt im Ladezustand, die Uhr steht
    await typeInto(g, 'password', campus.initialPassword);
    await g.press('Enter');
    await g.waitFor(() => {
      const info = window.__EDU_DEBUG.getChapterScene().getDebugInfo();
      return info.step === 'captcha' && info.isLoading;
    }, null, { timeout: 5000 });
    await g.eval(() => window.__EDU_DEBUG.getScene('Game').togglePause());
    await g.waitFor(() => window.__EDU_DEBUG.getSceneStatus('Ch1Registration') === 'paused');
    const clockPaused = (await g.state()).clockMinutes;
    await g.wait(2500); // länger als jede Ladezeit (höchstens 1,4 s)
    let d = await info(g);
    assert(d.step === 'captcha' && d.isLoading, `pausiert lädt die Seite nicht weiter (${d.step}, isLoading ${d.isLoading})`);
    assert((await g.state()).clockMinutes === clockPaused, 'Uhr steht während der Pause');
    await clickHud(g, 'resume');
    await waitStep(g, 'captcha');
    d = await info(g);
    assert(d.targets.robot, 'nach „Weiter“ ist die CAPTCHA-Seite fertig geladen');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('ch1: „Kapitel neu starten“ setzt das Kapitel sauber zurück (keine Reste, keine doppelten Listener)', async () => {
  const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
  try {
    const campus = await getCampus(g);
    await waitStep(g, 'login');
    const keyListeners = () => g.eval(() => window.__EDU_DEBUG.getChapterScene().input.keyboard.listenerCount('keydown'));
    const listenersFresh = await keyListeners();
    // Ein Fehlversuch, Lupe, dann bis ins offene CAPTCHA-Popup
    await typeInto(g, 'username', campus.username);
    await typeInto(g, 'password', 'falsch');
    await g.press('Enter');
    await clickTarget(g, 'magnifier');
    await typeInto(g, 'password', campus.initialPassword);
    await g.press('Enter');
    await waitStep(g, 'captcha');
    await openCaptcha(g);
    const before = await g.state();
    assert(before.totalFails === 1, `ein Fehlversuch vor dem Neustart (${before.totalFails})`);

    await clickHud(g, 'pause');
    await g.waitFor(() => window.__EDU_DEBUG.getSceneStatus('Ch1Registration') === 'paused');
    await g.wait(MODAL_OPEN_MS);
    await clickHud(g, 'restart');
    await waitStep(g, 'login');
    let d = await info(g);
    assert(d.loginFails === 0 && !d.usedMagnifier && !d.captchaOpen && d.captchaRound === 1 && d.chapterFails === 0,
      `Kapitel-Zustand zurückgesetzt (${JSON.stringify({ loginFails: d.loginFails, usedMagnifier: d.usedMagnifier, captchaOpen: d.captchaOpen })})`);
    assert(d.targets.magnifier && d.targets.username, 'Lupe-Knopf und Login-Formular wieder da');
    const scene = await g.eval(() => {
      const s = window.__EDU_DEBUG.getChapterScene();
      const D = Ch1RegistrationScene.DEPTHS;
      return {
        username: s.usernameInput.getValue(),
        password: s.passwordInput.getValue(),
        url: s.win.getUrl(),
        lens: Boolean(s.lens),
        popupLeftovers: s.children.list.filter((o) => o.depth === D.POPUP || o.depth === D.POPUP_FRONT).length,
      };
    });
    assert(scene.username === '' && scene.password === '', 'Felder sind leer');
    assert(/\/login$/.test(scene.url), `Adresszeile wieder auf /login (${scene.url})`);
    assert(!scene.lens && scene.popupLeftovers === 0, `keine Reste von Lupe/CAPTCHA-Popup (${scene.popupLeftovers})`);
    const after = await g.state();
    assert(after.status === 'running' && !after.paused && after.currentChapterId === 1, 'Lauf läuft weiter, Kapitel 1 aktiv');
    assert(after.totalFails === before.totalFails, 'Fehlversuche bleiben im Lauf gezählt (Neustart ist kein Freifahrtschein)');
    assert(await chapterStatus(g) === 'running', 'Kapitel-Szene läuft');
    const listenersAfter = await keyListeners();
    assert(listenersAfter === listenersFresh, `keydown-Listener nicht doppelt (${listenersFresh} → ${listenersAfter})`);
    await g.shot('ch1-restarted');

    // Danach normal spielbar …
    await typeInto(g, 'username', campus.username);
    await typeInto(g, 'password', campus.initialPassword);
    await g.press('Enter');
    await waitStep(g, 'captcha');
    // … und F5 funktioniert weiterhin (genau ein Neuladen)
    await g.eval(() => window.__EDU_DEBUG.getChapterScene().loadPage('sync'));
    await waitStep(g, 'sync');
    await g.press('F5');
    await waitStep(g, 'sync');
    d = await info(g);
    assert(d.syncReloads === 1, `ein F5 nach dem Neustart zählt genau einmal (${d.syncReloads})`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

// -----------------------------------------------------------------------------
// Balance-Messung (optional, dauert ca. 3 min): CH1_BALANCE=1 node tests/e2e/ch1.mjs
// Spielt wie eine Erstspieler:in mit Lese-/Denkpausen und zwei typischen Fehlern
// (I/l verwechselt → Lupe; „Kehrwoche“ sprengt die Höchstlänge) und misst Frust,
// Spielminuten und Echtzeit über __EDU_DEBUG.getState() bzw. das Event-Protokoll.
// -----------------------------------------------------------------------------

if (process.env.CH1_BALANCE) {
  await runTest('ch1: Balance – normaler Lauf mit typischen Fehlern (Messung)', async () => {
    const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
    const think = (ms) => g.wait(ms);
    const typeHuman = (text) => g.type(text, { delay: 190 });
    try {
      const campus = await getCampus(g);
      await waitStep(g, 'login');
      const startedAt = Date.now();
      // Login: Brief lesen, I und l verwechseln, Lupe, richtig abtippen
      await think(7000);
      await clickTarget(g, 'username');
      await typeHuman(campus.username);
      await think(1500);
      await clickTarget(g, 'password');
      await typeHuman('lI1O0' + campus.initialPassword.slice(5));
      await g.press('Enter');
      await think(5000);
      await clickTarget(g, 'magnifier');
      await think(5000);
      await clickTarget(g, 'password');
      await typeHuman(campus.initialPassword);
      await g.press('Enter');
      await waitStep(g, 'captcha');
      // CAPTCHA: lesen, ankreuzen, zweimal richtig wählen (Runde 1 scheitert immer)
      await think(4000);
      await openCaptcha(g);
      for (let round = 0; round < 2; round += 1) {
        await think(4000);
        const d = await info(g);
        for (const index of d.captchaTargets) {
          await clickTarget(g, 'tiles', index);
          await think(700);
        }
        await answerCaptcha(g, []);
        await think(2500);
      }
      await waitStep(g, 'tos');
      // Nutzungsordnung: kurz lesen, durchscrollen, akzeptieren
      await think(3000);
      const tos = await info(g);
      for (let i = 0; i < 40 && !(await info(g)).tosUnlocked; i += 1) {
        await g.wheel(tos.targets.tosPanel.x, tos.targets.tosPanel.y, 400);
        await think(450);
      }
      await think(1500);
      await clickTarget(g, 'accept');
      await think(2500);
      await clickModalButton(g, 1);
      await waitStep(g, 'password');
      // Passwort: Stück für Stück nach den Regeln, „Kehrwoche“ ist zu lang (Überraschungsregel)
      await think(4000);
      await clickTarget(g, 'newPassword');
      for (const [chunk, pause] of [['Kehrwoche', 3000], ['1', 2500], ['!', 3000], ['WWI26A', 9000], ['93', 5000]]) {
        await typeHuman(chunk);
        await think(pause);
      }
      let d = await info(g);
      assert(d.twistHits === 1, `Überraschungsregel hat zugeschlagen (${d.passwordFailing})`);
      await typeInto(g, 'newPassword', 'Brezel1!WWI26A93');
      await think(2000);
      await clickTarget(g, 'next');
      await think(2000);
      await clickTarget(g, 'confirm');
      await typeHuman('Brezel1!WWI26A93');
      await think(1000);
      await clickTarget(g, 'save');
      await waitStep(g, 'sync');
      // Synchronisation: lesen, neu laden, bis es klappt
      await think(5000);
      d = await info(g);
      while (!d.syncDone) {
        await clickTarget(g, 'reload');
        await waitStep(g, 'sync');
        await think(2500);
        d = await info(g);
      }
      await think(3000);
      await clickTarget(g, 'continue');
      await waitChapterComplete(g);
      const realSeconds = Math.round((Date.now() - startedAt) / 1000);
      const state = await g.state();
      const log = await g.eval(() => window.__EDU_DEBUG.events.filter((e) => e.event !== 'state-changed'));
      const jumps = log.filter((e) => e.event === 'clock-jump').reduce((sum, e) => sum + e.payload.minutes, 0);
      const frustEvents = log.filter((e) => e.event === 'frustration-changed');
      const own = frustEvents.filter((e) => e.payload.delta > 0 && e.payload.reason !== 'milestone');
      const ownGross = own.reduce((sum, e) => sum + e.payload.delta, 0);
      const milestones = log.filter((e) => e.event === 'clock-milestone').map((e) => e.payload.text.slice(0, 5));
      const clockAtRealPace = CLOCK_START + jumps + realSeconds / 4;
      console.log(`BALANCE ch1: Echtzeit ${realSeconds} s · Frust Ende ${state.frustration} % (Spitze ${state.frustrationPeak} %) · `
        + `Kapitel-Frust brutto ${ownGross} % [${own.map((e) => `${e.payload.reason} +${e.payload.delta}`).join(', ')}] · `
        + `Zeitstrafen ${jumps} min · Uhr ${state.clockLabel} (bei Echtzeit-Tempo ≈ ${fmtClock(clockAtRealPace)}) · `
        + `Meilensteine ${milestones.join(', ') || '–'} · Fehlversuche ${state.totalFails}`);
      assert(ownGross >= 8 && ownGross <= 12, `Kapitel-Frust brutto im Budget 8–12 % (${ownGross} %)`);
      g.assertNoErrors();
    } finally {
      await g.close();
    }
  });
}

