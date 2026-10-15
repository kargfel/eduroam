/**
 * ch4.mjs – Browser-Tests für Kapitel 4 „Das Zertifikat“ (Evil Twin).
 *
 * 1. Happy Path mit echten Klicks: Update-Meldung, vier automatische Runden (Details öffnen,
 *    richtig entscheiden, Auswertung bestätigen), Finale (Rundmail lesen, Fälschungen ablehnen,
 *    dem echten Netz vertrauen), Zusammenfassung → CHAPTER_COMPLETE, CERT_INSPECTOR, 0 Fehlversuche.
 * 2. Fehlerpfad: Evil Twin vertrauen (gephisht: Fehlversuch, Frust, Flag, PHISHED, Passwort
 *    ändern kostet Zeit), Countdown vertraut automatisch, Lupe kostet 2 min und markiert Felder.
 * 3. Pause/Weiter: Countdown steht während der Pause (HUD-Pause-Button), läuft danach weiter.
 * 4. debugSolve() mitten im offenen Dialog → Kapitel geschafft.
 * 5. Plot-Twist: echtes (erneuertes) Zertifikat ohne Rundmail abgelehnt → Tipp-Stufen, Rundmail
 *    kommt nach vorn, dann vertrauen → geschafft, aber ohne CERT_INSPECTOR.
 * 6. „Kapitel neu starten“ im Pause-Menü: frischer Durchlauf ab Runde 1.
 * Überall: keine Browser-Fehler; Screenshots screenshots/ch4-*.png.
 *
 * Klickpunkte liefert getDebugInfo().ui bzw. .networks[].center (Spielkoordinaten).
 * Aufruf: node tests/e2e/ch4.mjs
 */
import { launchGame, runTest, assert } from './harness.mjs';

const QUERY = 'chapter=4&skipintro=1&seed=7';
const STEP_TIMEOUT = 15000;
const MODAL_SETTLE_MS = 320;
const CARD_SETTLE_MS = 260;

/** getDebugInfo() der aktiven Kapitel-Szene (oder null). */
async function info(g) {
  return g.eval(() => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    return scene && scene.chapterId === 4 ? scene.getDebugInfo() : null;
  });
}

/** Wartet, bis das Kapitel in einem der Schritte ist; liefert die Debug-Info. */
async function waitStep(g, steps, timeout = STEP_TIMEOUT) {
  await g.waitFor(
    (wanted) => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      const state = scene && scene.chapterId === 4 ? scene.getDebugInfo() : null;
      return Boolean(state) && wanted.includes(state.step);
    },
    steps,
    { timeout }
  );
  return info(g);
}

async function clickPoint(g, point, label) {
  assert(point && Number.isFinite(point.x) && Number.isFinite(point.y), `Klickpunkt fehlt: ${label}`);
  await g.click(point.x, point.y);
}

/** Bestätigt die Android-Meldung im Handy (Update bzw. Finale). */
async function confirmPhoneCard(g) {
  await g.waitFor(() => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    return Boolean(scene && scene.getDebugInfo().ui.card);
  }, null, { timeout: STEP_TIMEOUT });
  await g.wait(CARD_SETTLE_MS);
  await clickPoint(g, (await info(g)).ui.card, 'Meldung im Handy');
}

/** Klickt den i-ten Button der offenen Auswertung. */
async function clickModalButton(g, index = 0) {
  await g.waitFor(() => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    return Boolean(scene && scene.getDebugInfo().ui.modalButtons.length > 0);
  }, null, { timeout: STEP_TIMEOUT });
  await g.wait(MODAL_SETTLE_MS);
  await clickPoint(g, (await info(g)).ui.modalButtons[index], `Modal-Button ${index}`);
}

/** Öffnet die Details im offenen Zertifikatsdialog. */
async function openDetails(g) {
  const state = await waitStep(g, ['dialog']);
  await g.wait(200);
  await clickPoint(g, state.ui.details, 'Details anzeigen');
  await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().getDebugInfo().dialog.detailsOpen === true);
  return info(g);
}

/** Entscheidet im offenen Dialog per Klick. */
async function decide(g, decision) {
  const state = await info(g);
  await clickPoint(g, decision === 'trust' ? state.ui.trust : state.ui.reject, decision);
}

/** Runden 1–4 per Klick richtig spielen (Details, Entscheidung, Auswertung bestätigen). */
async function playAutoRoundsCorrectly(g) {
  for (let round = 1; round <= 4; round += 1) {
    const state = await openDetails(g);
    await decide(g, state.dialog.trustworthy ? 'trust' : 'reject');
    await waitStep(g, ['result']);
    await clickModalButton(g, 0);
  }
  await waitStep(g, ['finale-intro']);
  await confirmPhoneCard(g);
  return waitStep(g, ['choose']);
}

async function hasEvent(g, name, chapterId) {
  return g.eval(
    ([eventName, id]) => window.__EDU_DEBUG.events.some((e) => e.event === eventName && (!id || (e.payload && e.payload.chapterId === id))),
    [name, chapterId]
  );
}

// ---------------------------------------------------------------------------

await runTest('Kapitel 4 – Happy Path mit echten Klicks (CERT_INSPECTOR)', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    let state = await waitStep(g, ['intro']);
    assert(state.round === 1 && state.roundCount === 5, 'Start in Runde 1 von 5');
    assert(state.networks.length === 3 && state.networks.every((n) => n.bssid), 'drei eduroam-Netze mit BSSID');
    await g.wait(300);
    await g.shot('ch4-01-update');
    await confirmPhoneCard(g);

    for (let round = 1; round <= 4; round += 1) {
      state = await waitStep(g, ['dialog']);
      assert(state.round === round, `Runde ${round} erwartet, ist ${state.round}`);
      assert(state.dialog && state.dialog.countdownRunning, 'Countdown läuft im Dialog');
      if (round === 1) await g.shot('ch4-02-dialog');
      state = await openDetails(g);
      assert(state.dialog.countdownRunning === false, 'Details halten den Countdown an');
      if (round === 1) await g.shot('ch4-03-details');
      if (round === 4) await g.shot('ch4-04-details-runde4');
      await decide(g, state.dialog.trustworthy ? 'trust' : 'reject');
      await waitStep(g, ['result']);
      if (round === 1 || round === 4) {
        await g.wait(MODAL_SETTLE_MS);
        await g.shot(round === 1 ? 'ch4-05-result' : 'ch4-05b-result-runde4');
      }
      await clickModalButton(g, 0);
    }

    // Finale
    state = await waitStep(g, ['finale-intro']);
    assert(state.isFinale && state.mode === 'choice', 'Finale erreicht');
    await g.wait(CARD_SETTLE_MS);
    await g.shot('ch4-06-finale-notice');
    await confirmPhoneCard(g);
    state = await waitStep(g, ['choose']);
    await g.shot('ch4-07-choose');

    // Rundmail unter dem Ausdruck lesen (hinten nur Kopf/Betreff, kein abgeschnittener Text)
    assert(state.newsBodyVisible === false, 'Rundmail-Text verborgen, solange sie hinten liegt');
    await clickPoint(g, state.ui.newsSheet, 'IT-Rundmail');
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().getDebugInfo().newsRead === true);
    await g.wait(300);
    await g.shot('ch4-08-news');
    state = await info(g);
    assert(state.frontSheet === 'news' && state.newsBodyVisible === true, 'Rundmail liegt vorn und ist lesbar');

    const order = [...state.networks].sort((a, b) => Number(a.trustworthy) - Number(b.trustworthy));
    for (const net of order) {
      await clickPoint(g, net.center, `Netz ${net.index}`);
      let dialogState = await waitStep(g, ['dialog']);
      assert(dialogState.dialog.networkIndex === net.index, 'Dialog zeigt das angetippte Netz');
      dialogState = await openDetails(g);
      if (net.trustworthy) {
        await g.shot('ch4-09-finale-echt');
        await decide(g, 'trust');
      } else {
        await decide(g, 'reject');
        await waitStep(g, ['result']);
        await clickModalButton(g, 0);
        await waitStep(g, ['choose']);
      }
    }
    state = await waitStep(g, ['final']);
    await g.wait(MODAL_SETTLE_MS);
    await g.shot('ch4-10-final');
    await clickModalButton(g, 0);
    await g.waitFor(() => window.__EDU_DEBUG.events.some((e) => e.event === 'chapter-complete' && e.payload.chapterId === 4), null, { timeout: 8000 });

    const snapshot = await g.state();
    assert(snapshot.totalFails === 0, `keine Fehlversuche (sind ${snapshot.totalFails})`);
    assert(snapshot.runAchievements.includes('CERT_INSPECTOR'), 'CERT_INSPECTOR freigeschaltet');
    assert(!snapshot.runAchievements.includes('PHISHED'), 'nicht gephisht');
    assert(snapshot.chapterStats[4] && snapshot.chapterStats[4].perfect === true, 'Kapitelstatistik: perfekt');
    assert(snapshot.frustration <= 10, `Frust bei perfektem Spiel klein (ist ${snapshot.frustration})`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 4 – Fehlerpfad: gephisht, Passwort ändern, Countdown, Lupe', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitStep(g, ['intro']);
    await confirmPhoneCard(g);

    // Runde 1: Evil Twin ohne Prüfung vertrauen
    let state = await waitStep(g, ['dialog']);
    assert(state.dialog.trustworthy === false, 'Runde 1 ist eine Fälschung');
    const before = await g.state();
    await g.wait(200);
    await decide(g, 'trust');
    await g.wait(260);
    await g.shot('ch4-11-gephisht-stempel');
    state = await waitStep(g, ['result']);
    let snapshot = await g.state();
    assert(snapshot.totalFails === before.totalFails + 1, 'Fehlversuch gebucht');
    assert(snapshot.frustration >= before.frustration + 15, `großer Frust (vorher ${before.frustration}, jetzt ${snapshot.frustration})`);
    assert(snapshot.flags.phished === true, "Flag 'phished' gesetzt");
    assert(snapshot.runAchievements.includes('PHISHED'), 'Erfolg PHISHED');
    await g.wait(MODAL_SETTLE_MS);
    await g.shot('ch4-12-gephisht-auswertung');
    const clockBefore = snapshot.clockMinutes;
    await clickModalButton(g, 0); // „Passwort ändern (+15 min)“
    snapshot = await g.state();
    assert(snapshot.clockMinutes >= clockBefore + 15, `Passwort ändern kostet Zeit (${clockBefore} → ${snapshot.clockMinutes})`);

    // Runde 2: nichts tun – der Countdown vertraut automatisch
    state = await waitStep(g, ['dialog']);
    await g.wait(10800);
    state = await waitStep(g, ['transition', 'result'], 6000);
    const stats = state.stats;
    assert(stats.autoTrusts === 1, `Countdown hat vertraut (autoTrusts ${stats.autoTrusts})`);
    await waitStep(g, ['result']);
    await clickModalButton(g, 0);

    // Runde 3: Lupe benutzen
    state = await waitStep(g, ['dialog']);
    const clockLupe = (await g.state()).clockMinutes;
    await clickPoint(g, state.ui.magnifier, 'Lupe');
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().getDebugInfo().dialog.magnifier === true);
    state = await info(g);
    assert(state.dialog.detailsOpen === true, 'Lupe öffnet die Details');
    assert((await g.state()).clockMinutes >= clockLupe + 2, 'Lupe kostet 2 min');
    await g.wait(250);
    await g.shot('ch4-13-lupe');
    await decide(g, state.dialog.trustworthy ? 'trust' : 'reject');
    await waitStep(g, ['result']);
    await clickModalButton(g, 0);
    await waitStep(g, ['dialog']);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 4 – Pause hält den Countdown an, Weiter setzt ihn fort', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitStep(g, ['intro']);
    await confirmPhoneCard(g);
    await waitStep(g, ['dialog']);
    await g.wait(800);
    const pauseButton = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('pause'));
    await clickPoint(g, pauseButton, 'HUD-Pause');
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === true);
    const frozen = (await info(g)).dialog.countdownMs;
    await g.wait(1500);
    const stillFrozen = (await info(g)).dialog.countdownMs;
    assert(Math.abs(frozen - stillFrozen) <= 40, `Countdown steht in der Pause (${frozen} → ${stillFrozen})`);
    await g.shot('ch4-14-pause');
    const resumeButton = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('resume'));
    await clickPoint(g, resumeButton, 'Weiter');
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === false);
    await g.wait(900);
    const running = await info(g);
    assert(running.step === 'dialog' && running.dialog.countdownMs < stillFrozen - 400, `Countdown läuft weiter (${stillFrozen} → ${running.dialog.countdownMs})`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 4 – debugSolve() mitten im Dialog schließt das Kapitel ab', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitStep(g, ['intro']);
    await confirmPhoneCard(g);
    await waitStep(g, ['dialog']);
    await g.eval(() => window.__EDU_DEBUG.solve());
    const state = await info(g);
    assert(state === null || state.isFinished === true, 'Kapitel ist abgeschlossen');
    await g.waitFor(() => window.__EDU_DEBUG.events.some((e) => e.event === 'chapter-complete' && e.payload.chapterId === 4), null, { timeout: 8000 });
    assert(await hasEvent(g, 'chapter-complete', 4), 'CHAPTER_COMPLETE für Kapitel 4');
    const snapshot = await g.state();
    assert(snapshot.chapterStats[4], 'Statistik für Kapitel 4 gespeichert');
    assert(snapshot.totalFails === 0, 'debugSolve spielt fehlerfrei');
    await g.wait(400);
    await g.shot('ch4-15-debugsolve');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 4 – Plot-Twist: echtes Netz ohne Rundmail abgelehnt → Tipps → Rundmail → verbunden', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitStep(g, ['intro']);
    await confirmPhoneCard(g);
    let state = await playAutoRoundsCorrectly(g);
    assert(state.newsRead === false, 'Rundmail noch ungelesen');
    const renewed = state.networks.find((net) => net.kind === 'renewed');
    assert(renewed && renewed.trustworthy, 'das erneuerte Zertifikat ist das echte');
    const failsBefore = (await g.state()).totalFails;

    // 1. Ablehnung: Tipp auf die Rundmail
    await clickPoint(g, renewed.center, 'echtes Netz');
    await openDetails(g);
    await decide(g, 'reject');
    state = await waitStep(g, ['result']);
    assert(state.stats.finaleParanoidCount === 1, 'erste Ablehnung des echten Netzes');
    assert((await g.state()).totalFails === failsBefore + 1, 'Paranoia zählt als Fehlversuch');
    await g.wait(MODAL_SETTLE_MS);
    await g.shot('ch4-16-twist-tipp1');
    await clickModalButton(g, 0);
    state = await waitStep(g, ['choose']);
    assert(state.networks.find((net) => net.index === renewed.index).canInspect, 'echtes Netz bleibt wählbar');

    // 2. Ablehnung: Rundmail kommt von selbst nach vorn
    await clickPoint(g, renewed.center, 'echtes Netz');
    await openDetails(g);
    await decide(g, 'reject');
    state = await waitStep(g, ['result']);
    assert(state.frontSheet === 'news' && state.newsRead === true, 'Tipp-Stufe 2 legt die Rundmail nach vorn');
    await clickModalButton(g, 0);
    await waitStep(g, ['choose']);
    await g.shot('ch4-17-twist-rundmail-vorn');

    // Jetzt vertrauen
    await clickPoint(g, renewed.center, 'echtes Netz');
    await openDetails(g);
    await decide(g, 'trust');
    await waitStep(g, ['final']);
    await clickModalButton(g, 0);
    await g.waitFor(() => window.__EDU_DEBUG.events.some((e) => e.event === 'chapter-complete' && e.payload.chapterId === 4), null, { timeout: 8000 });
    const snapshot = await g.state();
    assert(!snapshot.runAchievements.includes('CERT_INSPECTOR'), 'kein CERT_INSPECTOR nach Fehlurteilen');
    assert(!snapshot.flags.phished, 'nicht gephisht');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 4 – „Kapitel neu starten“ im Pause-Menü baut alles frisch auf', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitStep(g, ['intro']);
    await confirmPhoneCard(g);
    await openDetails(g);
    await decide(g, 'reject');
    await waitStep(g, ['result']);
    await clickModalButton(g, 0);
    await waitStep(g, ['dialog']);
    const pauseButton = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('pause'));
    await clickPoint(g, pauseButton, 'HUD-Pause');
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === true);
    await g.wait(250);
    const restartButton = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('restart'));
    await clickPoint(g, restartButton, 'Kapitel neu starten');
    const state = await waitStep(g, ['intro']);
    assert(state.round === 1 && state.stats.decisions === 0, 'neuer Durchlauf ab Runde 1');
    assert(state.dialog === null, 'kein alter Dialog');
    await confirmPhoneCard(g);
    const again = await waitStep(g, ['dialog']);
    assert(again.dialog.countdownRunning, 'Countdown läuft nach Neustart');
    await g.shot('ch4-18-neustart');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});
