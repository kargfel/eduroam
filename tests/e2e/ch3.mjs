/**
 * ch3.mjs – Browser-Tests für Kapitel 3 „Die Signaljagd“.
 *
 * 1. Happy Path mit echten Eingaben: „Herunterladen“ klicken, mit gehaltenen Pfeiltasten
 *    durch den Flur, im Sprint durchs Treppenhaus (Funkloch) und in die Bibliothek laufen,
 *    dort warten (Wartungsfenster, 99-%-Hänger) bis das Kapitel abgeschlossen ist.
 * 2. Fehlerpfad: im Treppenhaus stehen bleiben → Verbindungsabbruch (Fehlversuch + Frust),
 *    wieder raus → Neuverbindung; danach Countdown-Ablauf (Countdown per Testhilfe verkürzt)
 *    → Stempel, Dialog, Restfortschritt, Heatmap.
 * 3. Pause/Weiter über den Pause-Button der HUD: Countdown und Figur stehen still.
 * 4. debugSolve()-Pfad direkt aus dem Startdialog.
 * 5. „Kapitel neu starten“ über die HUD setzt alles zurück.
 * 6. Lesbarkeit: alle Kapitel-Texte ≥ 13 px, Statuszeilen der Karte passen ungekürzt.
 * 7. Optional (CH3_BALANCE=1): „normaler“ Erstlauf mit echten Tasten (Dialog lesen, im
 *    Hörsaal trödeln, ein Abbruch im Treppenhaus) – misst Frust und Spielminuten.
 *
 * Positionen der Figur kommen aus getDebugInfo() (Spielkoordinaten), Buttons werden über
 * ihren Text gefunden und echt angeklickt. Screenshots: screenshots/ch3-*.png
 * Aufruf (im Projektordner): node tests/e2e/ch3.mjs   ·   mit Balance-Lauf: CH3_BALANCE=1 node tests/e2e/ch3.mjs
 */
import { launchGame, runTest, assert } from './harness.mjs';

const QUERY = 'chapter=3&skipintro=1&seed=7';
const READY_TIMEOUT = 10000;
const WALK_TIMEOUT = 12000;
const DOWNLOAD_TIMEOUT = 150000; // Download in Echtzeit: perfekte Route ca. 60–75 s
const MIN_FONT_PX = 13;          // Lesbarkeit am Beamer
const BALANCE_RUN = Boolean(process.env.CH3_BALANCE);
const BALANCE_READ_DIALOG_MS = 8000; // so lange liest ein Erstspieler den Startdialog
const BALANCE_LOOK_AROUND_MS = 6500; // … und schaut sich im Hörsaal um (Hörsaal-Hinweis nach 5 s)
const BALANCE_NET_FRUST = [8, 12];   // Ziel laut Briefing (netto, nach Abschluss-Bonus)

/** getDebugInfo() der aktiven Kapitel-Szene. */
async function info(g) {
  return g.eval(() => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    return scene ? scene.getDebugInfo() : null;
  });
}

/** Wartet, bis das Kapitel 3 läuft und der Startdialog offen ist. */
async function waitForIntro(g) {
  await g.waitFor(() => {
    const scene = window.__EDU_DEBUG.getChapterScene();
    return Boolean(scene && scene.sys.settings.key === 'Ch3SignalHunt' && scene.getDebugInfo().step === 'intro');
  }, null, { timeout: READY_TIMEOUT });
  await g.wait(300); // Einblende-Animation des Dialogs
}

/** Sucht einen sichtbaren Text (z. B. Button-Beschriftung) in einer Szene und klickt seine Mitte. */
async function clickText(g, label, sceneKey = null) {
  const pos = await g.eval(({ label: wanted, sceneKey: key }) => {
    const debug = window.__EDU_DEBUG;
    const scene = key ? debug.getScene(key) : debug.getChapterScene();
    const found = [];
    const visit = (obj) => {
      if (!obj || obj.visible === false) return;
      if (obj.type === 'Text' && obj.text === wanted) found.push(obj);
      if (Array.isArray(obj.list)) obj.list.forEach(visit);
    };
    scene.children.list.forEach(visit);
    if (!found.length) return null;
    const bounds = found[found.length - 1].getBounds();
    return { x: bounds.centerX, y: bounds.centerY };
  }, { label, sceneKey });
  assert(pos, `Text „${label}“ nicht gefunden`);
  await g.click(pos.x, pos.y);
}

/**
 * Hält eine Taste, bis die Figur die Zielkoordinate erreicht (echte Tastatureingabe).
 * @param {'x'|'y'} axis
 * @param {'>='|'<='} cmp
 */
async function walk(g, key, axis, cmp, target) {
  await g.page.keyboard.down(key);
  try {
    await g.waitFor(({ axis: a, cmp: c, target: t }) => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      const p = scene && scene.getDebugInfo().player;
      if (!p) return false;
      return c === '>=' ? p[a] >= t : p[a] <= t;
    }, { axis, cmp, target }, { timeout: WALK_TIMEOUT });
  } finally {
    await g.page.keyboard.up(key);
  }
  await g.wait(150); // auslaufen lassen
}

/** Kurzform: Debug-Info muss eine Bedingung erfüllen. */
async function waitForInfo(g, predicate, arg = null, timeout = WALK_TIMEOUT) {
  await g.waitFor(predicate, arg, { timeout });
}

await runTest('Kapitel 3 – Happy Path mit echten Tasten (Sprint durchs Treppenhaus)', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitForIntro(g);
    await g.shot('ch3-start');
    let state = await g.state();
    assert(state.currentChapterId === 3, `Kapitel 3 erwartet, ist ${state.currentChapterId}`);
    assert(state.objective && state.objective.length > 0, 'Aufgabe im HUD gesetzt');

    await clickText(g, 'Herunterladen');
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().step === 'download');
    let d = await info(g);
    assert(d.room === 'hoersaal' && d.bars === 4, `Start im Hörsaal mit vollen Balken (${d.room}, ${d.bars})`);
    assert(d.rate < 0.25, `Hörsaal ist langsam (${d.rate} MB/s)`);

    // Raus aus dem Hörsaal, im oberen (trockenen) Teil des Flurs bleiben
    await walk(g, 'ArrowDown', 'y', '>=', 238);
    await g.shot('ch3-flur');
    // Sprint nach rechts durchs Treppenhaus (Funkloch mit Gnadenfrist)
    await walk(g, 'ArrowRight', 'x', '>=', 380);
    d = await info(g);
    assert(d.disconnects === 0, 'Sprint durchs Treppenhaus ohne Abbruch');
    // Durch die Bibliothekstür nach oben und zum besten Platz
    await walk(g, 'ArrowUp', 'y', '<=', 122);
    await walk(g, 'ArrowRight', 'x', '>=', 512);
    d = await info(g);
    assert(d.room === 'bibliothek', `in der Bibliothek (${d.room})`);
    await waitForInfo(g, () => {
      const i = window.__EDU_DEBUG.getChapterScene().getDebugInfo();
      return i.apId === 'bib' && i.connection === 'connected';
    });
    d = await info(g);
    assert(d.rate > 0.5, `Bibliothek ist schnell (${d.rate} MB/s)`);
    await g.shot('ch3-bibliothek');

    // Wartungsfenster des Bibliotheks-APs wird angekündigt
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().outage.state !== 'pending', null, DOWNLOAD_TIMEOUT);
    await g.wait(5600);
    await g.shot('ch3-wartungsfenster');

    // Bis zum Abschluss warten (99-%-Hänger inklusive)
    await waitForInfo(g, () => ['stall', 'done'].includes(window.__EDU_DEBUG.getChapterScene().getDebugInfo().step), null, DOWNLOAD_TIMEOUT);
    await g.shot('ch3-99prozent');
    await g.waitFor(() => Boolean(window.__EDU_DEBUG.getState().chapterStats[3]), null, { timeout: 20000 });
    state = await g.state();
    const stats = state.chapterStats[3];
    assert(stats.disconnects === 0, 'Statistik: keine Abbrüche');
    assert(stats.expiries === 0, 'Statistik: Countdown nicht abgelaufen');
    assert(state.runAchievements.includes('NO_DEADZONE'), `NO_DEADZONE erwartet: ${JSON.stringify(state.runAchievements)}`);
    assert(state.frustration <= 20, `Frust im Rahmen (${state.frustration} %)`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 3 – Fehlerpfad: Funkloch-Abbruch, Neuverbindung, abgelaufener Countdown', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitForIntro(g);
    await clickText(g, 'Herunterladen');
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().step === 'download');
    const before = await g.state();

    // Ins Treppenhaus und dort stehen bleiben → Abbruch nach der Gnadenfrist
    await walk(g, 'ArrowDown', 'y', '>=', 238);
    await walk(g, 'ArrowRight', 'x', '>=', 292);
    // Gnadenfrist (0,9 s): Karte zeigt „Kein Signal!“ mit Restsekunden. Ein Screenshot dauert
    // im Headless-Browser länger als die Frist → Simulation nur für die Aufnahme anhalten.
    const isInGrace = await g.eval(() => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      if (scene.sim.connection.state !== 'grace') return false;
      scene.sim.isFrozen = true;
      return true;
    });
    if (isInGrace) {
      await g.wait(120); // ein, zwei Frames zeichnen lassen
      await g.shot('ch3-gnadenfrist');
      await g.eval(() => { window.__EDU_DEBUG.getChapterScene().sim.isFrozen = false; });
    }
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().disconnects >= 1);
    await g.wait(250);
    await g.shot('ch3-funkloch');
    let d = await info(g);
    assert(d.connection === 'lost', `getrennt erwartet, ist ${d.connection}`);
    let state = await g.state();
    assert(state.totalFails > before.totalFails, 'Abbruch zählt als Fehlversuch');
    assert(state.frustration > before.frustration, 'Abbruch erhöht den Frust');
    assert(state.clockMinutes > before.clockMinutes, 'Abbruch kostet Zeit');

    // Wieder raus in den Flur Ost → Neuverbindung
    await walk(g, 'ArrowRight', 'x', '>=', 372);
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().connection === 'connected', null, 8000);

    // Zweiter Abbruch → Mitleids-Tipp: Funklöcher werden hervorgehoben
    await walk(g, 'ArrowLeft', 'x', '<=', 312);
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().disconnects >= 2);
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().isDeadzoneHighlighted, null, 3000);
    await g.wait(300);
    await g.shot('ch3-mitleid-funkloch');
    await walk(g, 'ArrowRight', 'x', '>=', 372);
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().connection === 'connected', null, 8000);

    // Countdown-Ablauf (Testhilfe: Countdown verkürzen statt zwei Minuten zu warten)
    const failsBefore = (await g.state()).totalFails;
    await g.eval(() => { window.__EDU_DEBUG.getChapterScene().sim.countdownS = 1.2; });
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().expiries === 1, null, 5000);
    await g.wait(250);
    await g.shot('ch3-zu-spaet-stempel');
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().isModalOpen, null, 5000);
    await g.wait(300);
    await g.shot('ch3-zu-spaet-dialog');
    state = await g.state();
    assert(state.totalFails === failsBefore + 1, 'Countdown-Ablauf zählt als Fehlversuch');
    d = await info(g);
    assert(d.step === 'dialog', `Simulation pausiert im Dialog (${d.step})`);
    assert(d.isHeatmapVisible, 'Mitleids-Tipp: Heatmap sichtbar');

    await clickText(g, 'Weiter laden');
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().step === 'download');
    d = await info(g);
    assert(d.countdownS > 85, `neuer Countdown (${d.countdownS} s)`);
    assert(d.chapterFails === 3, `drei Fehlversuche im Kapitel (${d.chapterFails})`);
    await g.wait(400);
    await g.shot('ch3-heatmap');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 3 – Pause und Weiter über die HUD', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitForIntro(g);
    await clickText(g, 'Herunterladen');
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().step === 'download');
    await walk(g, 'ArrowDown', 'y', '>=', 238);

    const pauseAt = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('pause'));
    assert(pauseAt, 'Pause-Button der HUD gefunden');
    await g.click(pauseAt.x, pauseAt.y);
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === true, null, { timeout: 3000 });
    const frozen = await info(g);
    await g.hold('ArrowLeft', 800); // Tasten während der Pause dürfen nichts bewegen
    await g.wait(400);
    const stillFrozen = await info(g);
    await g.shot('ch3-pause');
    assert(stillFrozen.countdownS === frozen.countdownS, 'Countdown steht in der Pause');
    assert(stillFrozen.player.x === frozen.player.x, 'Figur steht in der Pause');

    const resumeAt = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('resume'));
    assert(resumeAt, 'Weiter-Button gefunden');
    await g.click(resumeAt.x, resumeAt.y);
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === false, null, { timeout: 3000 });
    await g.wait(1000);
    const running = await info(g);
    assert(running.countdownS < frozen.countdownS - 0.5, 'Countdown läuft nach „Weiter“ wieder');
    assert(running.player.x === frozen.player.x, 'keine hängende Taste nach der Pause');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 3 – debugSolve() aus dem Startdialog', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitForIntro(g);
    await g.eval(() => window.__EDU_DEBUG.solve());
    const d = await info(g);
    assert(d.step === 'done' && d.progress === 1, `gelöst (${d.step}, ${d.progress})`);
    await g.wait(300);
    await g.shot('ch3-geloest');
    await g.waitFor(() => Boolean(window.__EDU_DEBUG.getState().chapterStats[3]), null, { timeout: 8000 });
    const state = await g.state();
    assert(state.chapterStats[3].solvedBy === 'debug', 'Statistik markiert debugSolve');
    assert(state.totalFails === 0, 'debugSolve ohne Fehlversuch');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 3 – „Kapitel neu starten“ über die HUD setzt alles zurück', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitForIntro(g);
    await clickText(g, 'Herunterladen');
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().step === 'download');
    await walk(g, 'ArrowDown', 'y', '>=', 238);
    await g.eval(() => window.__EDU_DEBUG.getChapterScene().revealHeatmap());

    const pauseAt = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').getButtonCenter('pause'));
    await g.click(pauseAt.x, pauseAt.y);
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === true, null, { timeout: 3000 });
    await clickText(g, 'Kapitel neu starten', 'HUD');
    await waitForIntro(g);
    const d = await info(g);
    assert(d.player.x === 220 && d.player.y === 180, `Figur wieder am Start (${d.player.x}|${d.player.y})`);
    assert(d.countdownS === 120 && d.progressMB === 0, 'Countdown und Download zurückgesetzt');
    assert(!d.isHeatmapVisible, 'Heatmap nach Neustart wieder verborgen');
    await clickText(g, 'Herunterladen');
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().step === 'download');
    await walk(g, 'ArrowDown', 'y', '>=', 238);
    await g.shot('ch3-neustart');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('Kapitel 3 – Lesbarkeit: alle Texte ≥ 13 px, Kartenzeilen ungekürzt, Hörsaal-Hinweis', async () => {
  const g = await launchGame({ query: QUERY });
  try {
    await waitForIntro(g);
    await clickText(g, 'Herunterladen');
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().step === 'download');
    const report = await g.eval((minPx) => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      // 1. Schriftgrößen aller sichtbaren Texte der Kapitel-Szene (inkl. Container-Kinder)
      const small = [];
      const visit = (obj) => {
        if (!obj || obj.visible === false) return;
        if (obj.type === 'Text' && obj.text) {
          const px = parseFloat(obj.style.fontSize);
          if (px < minPx) small.push(`${JSON.stringify(obj.text.slice(0, 24))}: ${px} px`);
        }
        if (Array.isArray(obj.list)) obj.list.forEach(visit);
      };
      scene.children.list.forEach(visit);
      // 2. Statuszeile, Detailzeile und Dateiname in der echten Schrift der Karte messen
      const L = Ch3SignalHuntScene.LAYOUT;
      const S = Ch3Logic.TEXTS.STATUS;
      const maxWidth = L.CARD.W - 2 * L.CARD.PAD;
      const tooWide = [];
      const check = (textObject, text) => {
        const old = textObject.text;
        textObject.setText(text);
        if (textObject.width > maxWidth) tooWide.push(`${text} (${Math.round(textObject.width)} > ${maxWidth} px)`);
        textObject.setText(old);
      };
      [S.READY, S.CONNECTED, S.ROAMING, S.GRACE, S.LOST, ...S.RECONNECTING, S.STALLING, S.DONE,
        Ch3Logic.fill(S.OUTAGE_WARNING, { ap: Ch3Logic.apById(Ch3Logic.LEVEL, Ch3Logic.BALANCE.OUTAGE.AP_ID).name, s: Ch3Logic.BALANCE.OUTAGE.WARNING_S }),
      ].forEach((text) => check(scene.statusText, text));
      [Ch3Logic.fill(S.GRACE_DETAIL, { s: '0,9' }), S.NO_AP,
        ...Ch3Logic.LEVEL.aps.map((ap) => Ch3Logic.fill(S.DEVICES, { ap: ap.name, n: 361 })),
      ].forEach((text) => check(scene.apText, text));
      Ch3Logic.TEXTS.FILE_NAMES.forEach((name) => check(scene.fileText, `↓ ${name}`));
      return { small, tooWide };
    }, MIN_FONT_PX);
    assert(report.small.length === 0, `Texte unter ${MIN_FONT_PX} px: ${report.small.join('; ')}`);
    assert(report.tooWide.length === 0, `Kartenzeilen zu breit: ${report.tooWide.join('; ')}`);

    // Im Hörsaal stehen bleiben: Hinweis-Toast + „Ladebalken kriecht“ am Ladebalken der Karte
    const before = await g.state();
    await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().hints.hall);
    await g.shot('ch3-hoersaal-tipp'); // sofort: Schwebetexte verblassen nach ca. 1 s
    const after = await g.state();
    assert(after.frustration > before.frustration, 'Trödeln im Hörsaal kostet etwas Frust');
    assert(after.totalFails === before.totalFails, 'Hörsaal-Hinweis ist kein Fehlversuch');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

if (BALANCE_RUN) {
  await runTest('Kapitel 3 – Balance: normaler Erstlauf (Dialog lesen, Hörsaal-Trödeln, ein Abbruch)', async () => {
    const g = await launchGame({ query: QUERY });
    try {
      await waitForIntro(g);
      const startedAt = Date.now();
      const before = await g.state();
      await g.wait(BALANCE_READ_DIALOG_MS);
      await clickText(g, 'Herunterladen');
      await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().step === 'download');
      await g.wait(BALANCE_LOOK_AROUND_MS);
      await walk(g, 'ArrowDown', 'y', '>=', 238);
      await walk(g, 'ArrowRight', 'x', '>=', 296); // im Treppenhaus stehen bleiben …
      await waitForInfo(g, () => window.__EDU_DEBUG.getChapterScene().getDebugInfo().disconnects >= 1, null, 5000);
      await walk(g, 'ArrowRight', 'x', '>=', 380); // … dann raus und in die Bibliothek
      await walk(g, 'ArrowUp', 'y', '<=', 122);
      await walk(g, 'ArrowRight', 'x', '>=', 512);
      await g.waitFor(() => Boolean(window.__EDU_DEBUG.getState().chapterStats[3]), null, { timeout: DOWNLOAD_TIMEOUT });
      const realSeconds = Math.round((Date.now() - startedAt) / 1000);
      const after = await g.state();
      // Uhr-Meilensteine sind kapitelübergreifend – herausrechnen
      const milestoneFrust = await g.eval(() => window.__EDU_DEBUG.events
        .filter((e) => e.event === EVENTS.FRUSTRATION_CHANGED && e.payload.reason === 'milestone')
        .reduce((sum, e) => sum + e.payload.delta, 0));
      const net = after.frustration - before.frustration - milestoneFrust;
      const minutes = after.clockMinutes - before.clockMinutes;
      console.log(`      Messung: ${net} % Frust netto (Spitze ${after.frustrationPeak} %), ${minutes} Spielminuten, ` +
        `${realSeconds} s Echtzeit ab Startdialog, ${after.totalFails} Fehlversuch(e)`);
      assert(after.chapterStats[3].disconnects === 1, 'genau ein Abbruch');
      assert(net >= BALANCE_NET_FRUST[0] && net <= BALANCE_NET_FRUST[1], `Frust ${net} % außerhalb ${BALANCE_NET_FRUST.join('–')} %`);
      g.assertNoErrors();
    } finally {
      await g.close();
    }
  });
}
