/**
 * ch5.mjs – Browser-Tests für Kapitel 5 „Der IT-Helpdesk“ (Ch5HelpdeskScene).
 *
 * 1. Happy Path als „normaler“ Lauf mit echten Eingaben und zwei typischen Fehlern:
 *    Cookie-Banner per ×, Dropdowns anklicken, Beschreibung tippen, absenden; Chat-Runden per
 *    Klick (Pop-ups per × schließen), dabei „Ich rufe an“ und „Ja, natürlich.“; Warteschleife,
 *    2nd Level, Finale: Power-Taste lange drücken → „Neu starten“ → gelöst → GameOver (Sieg)
 *    mit TURNED_OFF_ON und HELPDESK_HERO. Misst Frust (Ziel 8–12 %), Spielminuten, Kapitelzeit.
 * 2. Fehlerpfad: Cookie-Falle, leeres Formular, zwei falsche Antworten → Mitleids-Tipp (und
 *    zurückgesetzt in der nächsten Runde), Passwort verraten (Stempel), Phishing-Falle.
 * 3. debugSolve() aus einem „schwierigen“ Zustand (offene Liste, getippter Text, Pop-up,
 *    Power-Menü) → CHAPTER_COMPLETE im Event-Protokoll, GameOver, keine Kapitel-Erfolge;
 *    dazu der Sprechzeiten-Gag mit der Spieluhr.
 * 4. Pause/Weiter (Kapitelzeit, Pop-ups, Warteschleifenmusik) und „Kapitel neu starten“
 *    über den echten Button im Pause-Overlay.
 * 5. Kontext aus früheren Kapiteln: phished-Flag, eigenes Passwort (nur maskiert sichtbar),
 *    Spieluhr in der Sprechzeit → „Ich rufe an“ landet in der Telefon-Warteschleife.
 * Jeder Test prüft, dass keine Browser-Fehler auftreten. Screenshots: screenshots/ch5-*.png.
 *
 * Aufruf: node tests/e2e/ch5.mjs   (optional E2E_IGNORE="datei.js" für fremde Baustellen,
 * E2E_SLOW=n streckt alle Wartezeiten – unter Last läuft die Szenen-Zeit langsamer als die Uhr,
 * E2E_ONLY="Fehlerpfad" führt nur Tests aus, deren Name den Text enthält)
 */
import { launchGame, runTest as runHarnessTest, assert } from './harness.mjs';

const QUERY = 'chapter=5&skipintro=1&seed=7';
const SCENE_KEY = 'Ch5Helpdesk';
const IGNORE_ERRORS = (process.env.E2E_IGNORE || '').split(',').map((s) => s.trim()).filter(Boolean);
const DESCRIPTION = 'Konto gesperrt, eduroam sagt Authentifizierung fehlgeschlagen.';
const POLL_MS = 120;
/** Faktor für alle Zeitlimits (Szenen-Zeit kann unter Last deutlich langsamer laufen als die Wanduhr). */
const SLOW = Math.max(1, Number(process.env.E2E_SLOW) || 4);
const limit = (ms) => ms * SLOW;
const ONLY = (process.env.E2E_ONLY || '').trim();
/** runTest mit optionalem Namensfilter (E2E_ONLY). */
const runTest = (name, fn) => (!ONLY || name.includes(ONLY) ? runHarnessTest(name, fn) : Promise.resolve());
/** Frust-Ziel eines normalen Laufs laut Briefing (mit etwas Toleranz für verpasste Pop-ups). */
const NORMAL_RUN_FRUSTRATION = { MIN: 8, MAX: 14 };

/** Debug-Info der Kapitel-Szene (oder null). */
const info = (g) => g.eval(() => {
  const scene = window.__EDU_DEBUG.getChapterScene();
  return scene && typeof scene.getDebugInfo === 'function' ? scene.getDebugInfo() : null;
});

/** Wartet, bis das Kapitel einen bestimmten Schritt erreicht. */
async function waitForStep(g, step, timeout = limit(15000)) {
  await g.waitFor((wanted) => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    return Boolean(scene && scene.getDebugInfo && scene.getDebugInfo().step === wanted);
  }, step, { timeout });
}

/**
 * Mitte eines sichtbaren Textobjekts mit genau diesem Inhalt (z. B. Dropdown-Eintrag);
 * bei mehreren Treffern das oberste (höchste Tiefe des Wurzel-Objekts).
 */
async function findText(g, label) {
  return g.eval((wanted) => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    const hits = [];
    const visit = (obj, rootDepth) => {
      if (!obj || obj.visible === false) return;
      if (obj.type === 'Text' && obj.text === wanted) hits.push({ obj, rootDepth });
      if (Array.isArray(obj.list)) obj.list.forEach((child) => visit(child, rootDepth));
    };
    scene.children.list.forEach((obj) => visit(obj, obj.depth || 0));
    if (!hits.length) return null;
    hits.sort((a, b) => a.rootDepth - b.rootDepth);
    const bounds = hits[hits.length - 1].obj.getBounds();
    return { x: Math.round(bounds.centerX), y: Math.round(bounds.centerY) };
  }, label);
}

/** Schließt alle bereiten Pop-ups über das kleine × (oberstes zuerst). */
async function closePopups(g) {
  for (let i = 0; i < 8; i++) {
    const data = await info(g);
    const ready = (data.popups || []).filter((p) => p.isReady);
    if (!ready.length) return data;
    const top = ready[ready.length - 1];
    await g.click(top.close.x, top.close.y, { settle: 160 });
  }
  return info(g);
}

/** Wartet, bis Antworten klickbar sind (Pop-ups werden dabei weggeklickt). */
async function waitForOptions(g, roundId = null, timeout = limit(20000)) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    let data = await info(g);
    if (data.popups.some((p) => p.isReady)) data = await closePopups(g);
    if (data.step === 'chat' && data.canAnswer && data.popups.length === 0 && (!roundId || data.roundId === roundId)) return data;
    await g.wait(POLL_MS);
  }
  throw new Error(`Keine Antworten für Runde ${roundId || '(beliebig)'} erschienen`);
}

/**
 * Spielt weiter (Pop-ups per ×), bis `until(data)` wahr ist. Antwortet richtig – außer
 * `choose(data)` liefert eine Options-ID (z. B. für absichtliche Fehler).
 */
async function playUntil(g, until, { timeout = limit(90000), onTick = null, choose = null } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    let data = await info(g);
    assert(data, 'Kapitel-Szene ist aktiv');
    if (until(data)) return data;
    if (onTick) await onTick(data);
    if (data.popups.some((p) => p.isReady)) {
      await closePopups(g);
      continue;
    }
    if (data.step === 'chat' && data.canAnswer && data.popups.length === 0) {
      const wantedId = choose ? choose(data) : null;
      const option = data.options.find((o) => o.isEnabled && (wantedId ? o.id === wantedId : o.isCorrect));
      if (option) {
        await g.click(option.x, option.y);
        continue;
      }
    }
    await g.wait(POLL_MS);
  }
  throw new Error('Zeitüberschreitung beim Durchspielen');
}

/** Füllt das Support-Formular mit echten Klicks und Tastatureingaben aus. */
async function fillFormByHand(g) {
  const labels = await g.eval(() => ({
    category: Ch5Logic.getCategoryOptions().find((o) => o.value === 'account').label,
    office: Ch5Logic.getOfficeOptions(CAMPUS).find((o) => o.value === 'course').label,
  }));
  let data = await closePopups(g);
  await g.click(data.form.category.x, data.form.category.y, { settle: 250 });
  const category = await findText(g, labels.category);
  assert(category, `Dropdown-Eintrag „${labels.category}“ sichtbar`);
  await g.click(category.x, category.y, { settle: 250 });

  data = await closePopups(g);
  await g.click(data.form.office.x, data.form.office.y, { settle: 250 });
  const office = await findText(g, labels.office);
  assert(office, `Dropdown-Eintrag „${labels.office}“ sichtbar`);
  await g.click(office.x, office.y, { settle: 250 });

  data = await closePopups(g);
  await g.click(data.form.description.x, data.form.description.y);
  await g.type(DESCRIPTION);
  const values = await g.eval(() => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    return {
      category: scene.categoryDropdown.getValue(),
      office: scene.officeDropdown.getValue(),
      description: scene.descriptionInput.getValue(),
    };
  });
  assert(values.category === 'account', `Kategorie gewählt (${values.category})`);
  assert(values.office === 'course', `Sekretariat gewählt (${values.office})`);
  assert(values.description === DESCRIPTION, `Beschreibung getippt („${values.description}“)`);
}

/** Fotografiert bei kurz angehaltener Kapitel-Szene (kurzlebige Effekte, Animationen). */
async function freezeShot(g, name) {
  await g.eval((key) => window.__EDU_DEBUG.game.scene.pause(key), SCENE_KEY);
  try {
    await g.shot(name);
  } finally {
    await g.eval((key) => window.__EDU_DEBUG.game.scene.resume(key), SCENE_KEY);
  }
}

/**
 * Klickt (x, y) und fotografiert den Moment danach bei kurz angehaltener Kapitel-Szene –
 * Stempel sind nur ~1 s sichtbar, ein Canvas-Foto dauert unter Last fast so lange.
 */
async function clickAndFreezeShot(g, x, y, name, { settle = 260 } = {}) {
  await g.click(x, y, { settle });
  await freezeShot(g, name);
}

/** Klickt „Ticket absenden“ (Pop-ups vorher weg). */
async function submitForm(g) {
  const data = await closePopups(g);
  await g.click(data.form.submit.x, data.form.submit.y);
}

/** Wartet, bis der Cookie-Banner da und klickbar ist. */
async function waitForCookie(g) {
  await g.waitFor(() => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    return Boolean(scene && scene.getDebugInfo().popups.some((p) => p.type === 'cookie' && p.isReady));
  }, null, { timeout: limit(8000) });
  return info(g);
}

/**
 * Hält die Power-Taste gedrückt, bis das Handy reagiert (Menü bzw. Boot) – unter Last
 * dauert die Long-Press-Schwelle (Szenen-Zeit) in Wanduhr-Zeit länger.
 */
async function holdPowerKey(g, power, expectedState) {
  await g.mouseDown(power.x, power.y);
  try {
    await g.waitFor((state) => window.__EDU_DEBUG.getChapterScene().getDebugInfo().phone.state === state,
      expectedState, { timeout: limit(5000) });
  } finally {
    await g.mouseUp();
  }
}

/** Füllt das Formular programmatisch aus und schickt es ab (für Tests, die schnell in den Chat wollen). */
async function submitFormQuickly(g) {
  await g.eval(() => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    scene.categoryDropdown.setValue('account');
    scene.officeDropdown.setValue('course');
    scene.descriptionInput.setValue('Konto gesperrt, eduroam geht nicht mehr.');
    scene.handleSubmitForm();
  });
}

// ---------------------------------------------------------------------------

await runTest('Kapitel 5 – Happy Path: normaler Lauf mit echten Eingaben und zwei typischen Fehlern', async () => {
  const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
  try {
    await waitForStep(g, 'form');
    const wallStart = Date.now();
    const start = await g.state();
    assert(start.currentChapterId === 5, 'Kapitel 5 läuft');
    assert(/Support-Ticket/.test(start.objective), `Aufgabe im HUD (${start.objective})`);

    await waitForCookie(g);
    await g.shot('ch5-01-form-cookie');
    await fillFormByHand(g);
    await g.shot('ch5-02-form-filled');
    await submitForm(g);
    await waitForStep(g, 'chat');

    // Erstes Pop-up im Chat („Ticket zusammengeführt“, +2 % Frust für alle) fotografieren, dann Runde 1
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().getDebugInfo().popups.some((p) => p.type === 'merged' && p.isReady),
      null, { timeout: limit(10000) });
    await g.shot('ch5-04-chat-popup');
    let data = await waitForOptions(g, 'identity');
    assert(data.options.length === 4, `vier Antworten (${data.options.length})`);
    const identity = await g.eval(() => CAMPUS.identity);
    assert(data.options.some((o) => o.isCorrect && o.label === identity), 'richtige Antwort ist CAMPUS.identity');
    await g.shot('ch5-03-chat-round1');

    // Bis zur Eskalationsfrage spielen, dann typischer Fehler 1: „Ich rufe an“ (07:4x → Bandansage)
    data = await playUntil(g, (d) => d.step === 'chat' && d.roundId === 'escalate' && d.canAnswer && d.popups.length === 0);
    const beforeCall = await g.state();
    const call = data.options.find((o) => o.id === 'call');
    await g.click(call.x, call.y);
    let state = await g.state();
    assert(state.totalFails === beforeCall.totalFails + 1, 'Anruf zählt als Fehlversuch');
    assert(state.clockMinutes >= beforeCall.clockMinutes + 2, `Bandansage kostet Zeit (${beforeCall.clockMinutes} → ${state.clockMinutes})`);

    // Weiter bis zur Warteschleife
    data = await playUntil(g, (d) => d.step === 'hold');
    assert(data.holdMusic === true, 'Warteschleifenmusik an');
    assert(await g.eval(() => SFX.isHoldMusicPlaying()), 'SFX meldet Warteschleife');
    await g.wait(1600);
    await g.shot('ch5-05-hold');

    // Warteschleife überstehen (Pop-ups wegklicken) → 2nd Level
    data = await playUntil(g, (d) => d.step === 'chat' && d.roundId === 'certificate', { timeout: limit(45000) });
    assert(!data.holdMusic, 'Musik nach der Warteschleife aus');
    assert(!(await g.eval(() => SFX.isHoldMusicPlaying())), 'SFX-Warteschleife gestoppt');
    data = await waitForOptions(g, 'certificate');
    assert(!data.tipIsMercy, 'Post-it zeigt keinen alten Mitleids-Tipp');
    await g.shot('ch5-06-second-level');

    // Bis zur Finalfrage, dann typischer Fehler 2: „Ja, natürlich.“ („Das sagen alle“)
    data = await playUntil(g, (d) => d.step === 'chat' && d.roundId === 'restart' && d.canAnswer && d.popups.length === 0);
    assert(data.options.length === 2, 'Finalfrage hat zwei Antworten');
    const lie = data.options.find((o) => o.id === 'lie');
    await g.click(lie.x, lie.y);
    await waitForStep(g, 'finale');
    data = await info(g);
    assert(/Power-Taste/.test((await g.state()).objective), 'Aufgabe nennt die Power-Taste');
    await g.wait(1600); // Markierung blinkt zweimal und bleibt dann stehen
    await g.shot('ch5-07-finale');

    // Power-Taste lange drücken → Menü → „Neu starten“ → Boot-Animation
    await holdPowerKey(g, data.phone.power, 'menu');
    await g.wait(200);
    await g.shot('ch5-08-power-menu');
    data = await info(g);
    const restart = data.phone.menu.find((m) => m.id === 'restart');
    assert(restart, 'Menüeintrag „Neu starten“');
    await g.click(restart.x, restart.y, { settle: 0 });
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().getDebugInfo().phone.state === 'shutting-down', null, { timeout: limit(2000) });
    await g.wait(250);
    await freezeShot(g, 'ch5-09-restarting');
    await waitForStep(g, 'done', limit(10000));
    const doneInfo = await info(g);
    const wallMs = Date.now() - wallStart;
    // Warten, bis der Stempel „GELÖST“ gelandet ist, dann die Szene kurz anhalten
    // (sonst kann unter Last schon der Kapitelwechsel laufen)
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().children.list
      .some((o) => o.isStamp && o.alpha > 0.9 && Math.abs(o.scaleX - 1) < 0.02), null, { timeout: limit(3000) });
    await freezeShot(g, 'ch5-10-solved');

    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('GameOver'), null, { timeout: limit(12000) });
    const end = await g.state();
    assert(end.status === 'won', `Lauf gewonnen (${end.status})`);
    assert(end.runAchievements.includes('TURNED_OFF_ON'), 'Erfolg TURNED_OFF_ON');
    assert(end.runAchievements.includes('HELPDESK_HERO'), 'Erfolg HELPDESK_HERO');
    assert(end.chapterStats[5] && end.chapterStats[5].solvedBy === 'player', 'Kapitel-Statistik vom Spieler');
    assert(end.totalFails === 2, `genau die zwei typischen Fehler (${end.totalFails})`);
    const minutes = end.clockMinutes - start.clockMinutes;
    console.log(`      Normaler Lauf: Frust Spitze ${end.frustrationPeak} %, Ende ${end.frustration} %, `
      + `${minutes} Spielminuten (${start.clockLabel} → ${end.clockLabel}), Fehlversuche ${end.totalFails}, `
      + `Kapitelzeit ${(doneInfo.elapsedMs / 1000).toFixed(1)} s (Wanduhr ${(wallMs / 1000).toFixed(1)} s)`);
    assert(end.frustrationPeak >= NORMAL_RUN_FRUSTRATION.MIN && end.frustrationPeak <= NORMAL_RUN_FRUSTRATION.MAX,
      `Frust eines normalen Laufs im Ziel (${end.frustrationPeak} %)`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 5 – Fehlerpfad: Fallen, leeres Formular, Mitleids-Tipp, Stempel', async () => {
  const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
  try {
    await waitForStep(g, 'form');
    const F = await g.eval(() => CONFIG.FRUSTRATION);

    // Cookie-Banner: „Einstellungen“ ist eine Falle (+2 min)
    let data = await waitForCookie(g);
    const before = await g.state();
    const settings = data.popups.find((p) => p.type === 'cookie').actions.find((a) => a.id === 'settings');
    await g.click(settings.x, settings.y);
    let state = await g.state();
    assert(state.totalFails === before.totalFails + 1, 'Cookie-Falle zählt als Fehlversuch');
    assert(state.clockMinutes >= before.clockMinutes + 2, `Cookie-Falle kostet Zeit (${before.clockMinutes} → ${state.clockMinutes})`);

    // Leeres Formular absenden
    await submitForm(g);
    state = await g.state();
    assert(state.totalFails === before.totalFails + 2, `leeres Formular ist ein Fehlversuch (${state.totalFails})`);
    assert(state.frustration > before.frustration, 'Frust steigt');
    data = await info(g);
    assert(data.form.message.length > 0, 'Fehlermeldung im Formular sichtbar');
    await g.shot('ch5-err-01-form');

    await fillFormByHand(g);
    await submitForm(g);
    await waitForStep(g, 'chat');

    // Runde 1: zwei falsche Antworten → Mitleids-Tipp + grüne Hervorhebung
    for (let i = 0; i < 2; i++) {
      data = await waitForOptions(g, 'identity');
      const wrong = data.options.find((o) => !o.isCorrect && o.isEnabled);
      const fails = (await g.state()).totalFails;
      await g.click(wrong.x, wrong.y);
      await g.waitFor((n) => window.__EDU_DEBUG.getState().totalFails > n, fails, { timeout: limit(4000) });
    }
    data = await waitForOptions(g, 'identity');
    assert(data.mercyRounds.includes('identity'), 'Mitleids-Tipp für die Identitäts-Runde');
    assert(data.tipIsMercy, 'Post-it zeigt den Mitleids-Tipp');
    assert(data.options.filter((o) => !o.isEnabled).length === 2, 'falsch gewählte Antworten sind gesperrt');
    await g.shot('ch5-err-02-mercy');
    const correct = data.options.find((o) => o.isCorrect);
    await g.click(correct.x, correct.y);

    // Runde 2: der Tipp der vorigen Runde ist weg; Passwort verraten → großer Stempel, viel Frust, Zeitstrafe
    data = await waitForOptions(g, 'password');
    assert(!data.tipIsMercy, `neue Runde ohne alten Mitleids-Tipp („${data.tip}“)`);
    const send = data.options.find((o) => o.id === 'send');
    const beforeSend = await g.state();
    await clickAndFreezeShot(g, send.x, send.y, 'ch5-err-03-stamp');
    state = await g.state();
    assert(state.frustration >= Math.min(100, beforeSend.frustration + F.LARGE), `Passwort verraten kostet viel Frust (${beforeSend.frustration} → ${state.frustration})`);
    assert(state.clockMinutes >= beforeSend.clockMinutes + 5, 'Passwort verraten kostet Zeit');

    // Phishing-Pop-up (gezielt geöffnet) – „Jetzt entsperren“ ist eine Falle
    await g.eval(() => window.__EDU_DEBUG.getChapterScene().spawnPopup('phishing'));
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().getDebugInfo().popups.some((p) => p.type === 'phishing' && p.isReady),
      null, { timeout: limit(4000) });
    data = await info(g);
    const unlock = data.popups.find((p) => p.type === 'phishing').actions.find((a) => a.id === 'unlock');
    const beforePhish = await g.state();
    await clickAndFreezeShot(g, unlock.x, unlock.y, 'ch5-err-04-phishing');
    state = await g.state();
    assert(state.totalFails === beforePhish.totalFails + 1, 'Phishing-Falle zählt');
    assert(state.frustration > beforePhish.frustration || state.frustration === 100, 'Phishing kostet Frust');
    data = await info(g);
    assert(data.trapsClicked >= 2, `Fallen gezählt (${data.trapsClicked})`);
    assert(data.tipIsMercy && /×/.test(data.tip), `nach zwei Fallen: ×-Tipp auf dem Post-it („${data.tip}“)`);

    // Rest per debugSolve – auch nach Fehlern sauber abschließbar
    await g.eval(() => window.__EDU_DEBUG.solve());
    await g.waitFor(() => window.__EDU_DEBUG.getState().status === 'won', null, { timeout: limit(12000) });
    const end = await g.state();
    console.log(`      Fehlerpfad: Frust ${end.frustration} % (Spitze ${end.frustrationPeak} %), Fehlversuche ${end.totalFails}, ${end.clockLabel}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 5 – debugSolve() aus schwierigem Zustand und Sprechzeiten mit der Spieluhr', async () => {
  const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
  try {
    await waitForStep(g, 'form');
    let data = await info(g);
    assert(data.officeHoursOpen === false, 'um 07:30 ist die Telefon-Sprechzeit zu');
    await g.eval(() => window.__EDU_DEBUG.addMinutes(95)); // → 09:05
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().getDebugInfo().officeHoursOpen === true, null, { timeout: limit(3000) });
    await g.wait(300);
    await g.shot('ch5-hours-open');

    // Schwieriger Zustand: Pop-up offen, Power-Menü offen, Text getippt, Dropdown-Liste offen
    await g.eval(() => window.__EDU_DEBUG.getChapterScene().descriptionInput.focus());
    await g.type('Hilfe');
    await waitForCookie(g);
    data = await info(g);
    await holdPowerKey(g, data.phone.power, 'menu');
    await g.click(data.form.category.x, data.form.category.y, { settle: 250 });
    const messy = await g.eval(() => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      return { dropdownOpen: UI.Dropdown.isAnyOpen(scene), phone: scene.getDebugInfo().phone.state, popups: scene.getDebugInfo().popups.length };
    });
    assert(messy.dropdownOpen && messy.phone === 'menu' && messy.popups >= 1, `schwieriger Zustand hergestellt (${JSON.stringify(messy)})`);

    await g.eval(() => window.__EDU_DEBUG.clearEvents());
    const before = await g.state();
    await g.eval(() => window.__EDU_DEBUG.solve());
    await waitForStep(g, 'done', limit(3000));
    data = await info(g);
    assert(data.progress === 1 && data.statusLabel === 'Gelöst', `Ticket gelöst (${data.statusLabel})`);
    assert(data.phone.wifi === 'connected' && data.phone.state === 'on' && data.phone.menu.length === 0, 'Handy verbunden, Menü zu');
    assert(!(await g.eval(() => UI.Dropdown.isAnyOpen(window.__EDU_DEBUG.getChapterScene()))), 'Dropdown-Liste geschlossen');
    await g.wait(250);
    await g.shot('ch5-debug-solved');

    await g.waitFor(() => window.__EDU_DEBUG.events.some((e) => e.event === EVENTS.CHAPTER_COMPLETE && e.payload.chapterId === 5),
      null, { timeout: limit(6000) });
    const complete = await g.eval(() => window.__EDU_DEBUG.events.find((e) => e.event === EVENTS.CHAPTER_COMPLETE).payload);
    assert(complete.stats.solvedBy === 'debug', `CHAPTER_COMPLETE mit solvedBy debug (${JSON.stringify(complete.stats)})`);
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('GameOver'), null, { timeout: limit(12000) });
    const end = await g.state();
    assert(end.status === 'won', 'Lauf gewonnen (Kapitel 5 ist das letzte)');
    assert(!end.runAchievements.includes('TURNED_OFF_ON') && !end.runAchievements.includes('HELPDESK_HERO'),
      `debugSolve vergibt keine Kapitel-Erfolge (${end.runAchievements.join(', ')})`);
    assert(end.totalFails === before.totalFails && end.frustration <= before.frustration, 'debugSolve ohne Strafen');
    assert(!(await g.eval(() => SFX.isHoldMusicPlaying())), 'keine Warteschleifenmusik mehr');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 5 – Pause/Weiter (Zeit, Pop-ups, Warteschleife) und Kapitel neu starten per Button', async () => {
  const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
  try {
    await waitForStep(g, 'form');
    const pauseButton = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('pause'));
    await g.click(pauseButton.x, pauseButton.y);
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === true);
    await g.waitFor((key) => window.__EDU_DEBUG.getSceneStatus(key) === 'paused', SCENE_KEY);
    const paused = await info(g);
    await g.wait(1800);
    const stillPaused = await info(g);
    assert(stillPaused.elapsedMs === paused.elapsedMs, `Kapitelzeit steht (${paused.elapsedMs} → ${stillPaused.elapsedMs})`);
    assert(stillPaused.popups.length === paused.popups.length, 'keine Pop-ups während der Pause');
    await g.shot('ch5-pause');
    const resumeButton = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('resume'));
    await g.click(resumeButton.x, resumeButton.y);
    await g.waitFor((key) => window.__EDU_DEBUG.getSceneStatus(key) === 'running', SCENE_KEY);
    await waitForCookie(g); // der Banner kommt nach dem Weiter

    // Schnell in die Warteschleife (Formular programmatisch, Antworten per Klick)
    await submitFormQuickly(g);
    await playUntil(g, (d) => d.step === 'hold');
    await g.wait(300);
    assert(await g.eval(() => SFX.isHoldMusicPlaying()), 'Musik läuft in der Warteschleife');
    await g.press('Escape'); // Escape gehört dem HUD: Pause
    await g.waitFor((key) => window.__EDU_DEBUG.getSceneStatus(key) === 'paused', SCENE_KEY);
    assert(!(await g.eval(() => SFX.isHoldMusicPlaying())), 'Pause stoppt die Warteschleifenmusik');
    const queueBefore = (await info(g)).queuePosition;
    await g.wait(3000);
    assert((await info(g)).queuePosition === queueBefore, 'Warteschlange steht in der Pause');
    const resumeAgain = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('resume'));
    await g.click(resumeAgain.x, resumeAgain.y);
    await g.waitFor((key) => window.__EDU_DEBUG.getSceneStatus(key) === 'running', SCENE_KEY);
    assert(await g.eval(() => SFX.isHoldMusicPlaying()), 'Weiter startet die Musik wieder');

    // Kapitel neu starten über den Button im Pause-Overlay: alles frisch, Musik aus, keine Fehler
    await g.click(pauseButton.x, pauseButton.y);
    await g.waitFor((key) => window.__EDU_DEBUG.getSceneStatus(key) === 'paused', SCENE_KEY);
    const restartButton = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('restart'));
    assert(restartButton, 'Button „Kapitel neu starten“ im Pause-Overlay');
    await g.click(restartButton.x, restartButton.y);
    await g.waitFor(() => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      return Boolean(scene && scene.getDebugInfo().step === 'form' && scene.getDebugInfo().elapsedMs < 1500);
    }, null, { timeout: limit(8000) });
    assert(!(await g.state()).paused, 'nach dem Neustart läuft das Spiel');
    assert(!(await g.eval(() => SFX.isHoldMusicPlaying())), 'Neustart stoppt die Warteschleifenmusik');
    const fresh = await info(g);
    assert(fresh.progress === 0 && fresh.popups.length <= 1 && !fresh.holdMusic, 'Kapitel ist frisch');

    // Nach dem Neustart ist das Kapitel wieder normal spielbar
    await waitForCookie(g);
    await fillFormByHand(g);
    await submitForm(g);
    await waitForOptions(g, 'identity');
    await g.eval(() => window.__EDU_DEBUG.solve());
    await g.waitFor(() => window.__EDU_DEBUG.getState().status === 'won', null, { timeout: limit(12000) });
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 5 – Kontext aus früheren Kapiteln: phished, eigenes Passwort, Sprechzeit offen', async () => {
  const g = await launchGame({ query: QUERY, ignoreErrors: IGNORE_ERRORS });
  try {
    await waitForStep(g, 'form');
    const password = 'Spätzle#42Kehrwoche';
    await g.eval((pw) => {
      GameState.setFlag('phished', true);
      GameState.setCredentials({ username: CAMPUS.username, password: pw });
      window.__EDU_DEBUG.addMinutes(150); // 07:30 → 10:00, Telefon-Sprechzeit läuft
      window.__EDU_DEBUG.getScene('Game').restartChapter();
    }, password);
    await g.waitFor(() => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      return Boolean(scene && scene.getDebugInfo().step === 'form' && scene.getDebugInfo().elapsedMs < 2000);
    }, null, { timeout: limit(8000) });
    const texts = await g.eval(() => window.__EDU_DEBUG.getChapterScene().texts);
    assert(texts.lockStatus.includes('Kevin'), 'Sperrmeldung erwähnt Kevin (phished)');
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().getDebugInfo().officeHoursOpen === true, null, { timeout: limit(3000) });

    await submitFormQuickly(g);
    // Passwort-Runde: nur maskiert sichtbar
    await playUntil(g, (d) => d.step === 'chat' && d.roundId === 'password' && d.canAnswer && d.popups.length === 0);
    let data = await info(g);
    const send = data.options.find((o) => o.id === 'send');
    assert(send.label.startsWith('Klar: Sp') && !send.label.includes(password), `Passwort maskiert (${send.label})`);
    const refuse = data.options.find((o) => o.isCorrect);
    await g.click(refuse.x, refuse.y);

    // Eskalations-Runde: Anrufen in der Sprechzeit → Warteschlange, +5 min
    data = await waitForOptions(g, 'escalate');
    const call = data.options.find((o) => o.id === 'call');
    const before = await g.state();
    await g.click(call.x, call.y);
    const after = await g.state();
    assert(after.totalFails === before.totalFails + 1, 'Anruf ist ein Fehlversuch');
    assert(after.clockMinutes >= before.clockMinutes + 5, `Telefon-Warteschleife kostet 5 min (${before.clockMinutes} → ${after.clockMinutes})`);
    await waitForOptions(g, 'escalate');
    const chatText = await g.eval(() => window.__EDU_DEBUG.getChapterScene().chatContent.list
      .map((bubble) => bubble.list.filter((o) => o.type === 'Text').map((o) => o.text).join(' ')).join('\n'));
    assert(/Platz 47/.test(chatText), 'Antwort zur offenen Sprechzeit („Platz 47“) im Chat');
    await g.shot('ch5-context-call');

    await g.eval(() => window.__EDU_DEBUG.solve());
    await g.waitFor(() => window.__EDU_DEBUG.getState().status === 'won', null, { timeout: limit(12000) });
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});
