/**
 * flow.mjs – Ablaufsteuerung im Browser (Bereich „scenes“).
 *
 * Pause (stoppt Uhr und Kapitel, Weiter), Kapitel neu starten, Hauptmenü, Rage-Quit
 * (im Kapitel und im Intro), ?chapter=3&skipintro=1, Kapitelwahl im Menü (gesperrt /
 * ?unlock=all), Escape-Pause, doppeltes CHAPTER_COMPLETE, GameOver-Buttons.
 * Funktioniert mit Platzhalter- und mit echten Kapiteln.
 *
 * Aufruf: node tests/e2e/flow.mjs
 */
import { launchGame, runTest, assert } from './harness.mjs';

/** Optional: E2E_IGNORE="datei1.js,datei2.js" ignoriert Browser-Fehler aus fremden Baustellen. */
const IGNORE_ERRORS = (process.env.E2E_IGNORE || '').split(',').map((s) => s.trim()).filter(Boolean);

const MINUTE_MS = 4000; // CONFIG.CLOCK.REAL_MS_PER_GAME_MINUTE
/**
 * Rage-Moment (950 ms Szenen-Zeit) + Szenenwechsel. Großzügig, weil Phaser in den ersten
 * 120 Frames nach dem Start delta auf 16,7 ms deckelt: Bei langsamen Headless-Frames
 * (SwiftShader, ~45 ms in Kapitel 2) laufen Szenen-Timer dann nur mit ~⅓ Geschwindigkeit.
 */
const RAGE_TIMEOUT_MS = 15000;

/** Mitte eines registrierten Buttons einer Szene (Spielkoordinaten). */
async function buttonCenter(g, sceneKey, id) {
  const center = await g.eval(([key, buttonId]) => {
    const scene = window.__EDU_DEBUG.getScene(key);
    return scene && scene.getButtonCenter ? scene.getButtonCenter(buttonId) : null;
  }, [sceneKey, id]);
  assert(center, `Button „${id}“ in Szene ${sceneKey} gefunden`);
  return center;
}

async function clickButton(g, sceneKey, id) {
  const center = await buttonCenter(g, sceneKey, id);
  await g.click(center.x, center.y);
}

const isActive = (key) => window.__EDU_DEBUG.getActiveScenes().includes(key);

await runTest('flow: Pause stoppt Uhr und Kapitel, „Weiter“ setzt fort', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, query: 'chapter=1&skipintro=1' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));
    await clickButton(g, 'HUD', 'pause');
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === true);
    await g.waitFor(() => window.__EDU_DEBUG.getSceneStatus('Ch1Registration') === 'paused');
    assert(await g.eval(() => window.__EDU_DEBUG.getScene('HUD').isPauseOverlayVisible()), 'Pause-Overlay sichtbar');
    assert(await g.eval(() => window.__EDU_DEBUG.getChapterScene() !== null), 'pausiertes Kapitel bleibt erreichbar');

    const before = (await g.state()).clockMinutes;
    await g.wait(MINUTE_MS + 600);
    const after = (await g.state()).clockMinutes;
    assert(after === before, `Uhr steht in der Pause (${before} → ${after})`);
    await g.shot('scenes-pause');

    await clickButton(g, 'HUD', 'resume');
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === false);
    await g.waitFor(() => window.__EDU_DEBUG.getSceneStatus('Ch1Registration') === 'running');
    assert(!(await g.eval(() => window.__EDU_DEBUG.getScene('HUD').isPauseOverlayVisible())), 'Overlay weg');
    await g.waitFor((t) => window.__EDU_DEBUG.getState().clockMinutes > t, after, { timeout: 2 * MINUTE_MS + 1000 });
    const pauseEvents = await g.eval(() => window.__EDU_DEBUG.events
      .filter((e) => e.event === EVENTS.PAUSE_CHANGED)
      .map((e) => Boolean(e.payload && e.payload.paused))
      .slice(-2));
    assert(JSON.stringify(pauseEvents) === '[true,false]', `PAUSE_CHANGED-Protokoll (${JSON.stringify(pauseEvents)})`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: „Kapitel neu starten“ setzt das Kapitel zurück, der Lauf bleibt', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, query: 'chapter=1&skipintro=1' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));
    await g.eval(() => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      window.__createCount = 0;
      scene.events.on('create', () => { window.__createCount += 1; });
      scene.fail('Testfehler', { stamp: null, shake: false });
    });
    const failed = await g.state();
    assert(failed.totalFails === 1, `Fehlversuch gezählt (${failed.totalFails})`);
    assert(await g.eval(() => window.__EDU_DEBUG.getChapterScene().chapterFails === 1), 'chapterFails = 1');

    await clickButton(g, 'HUD', 'pause');
    await g.waitFor(() => window.__EDU_DEBUG.getScene('HUD').isPauseOverlayVisible());
    await clickButton(g, 'HUD', 'restart');
    await g.waitFor(() => window.__createCount === 1);
    await g.waitFor(() => window.__EDU_DEBUG.getSceneStatus('Ch1Registration') === 'running');
    const state = await g.state();
    assert(state.paused === false, 'Pause aufgehoben');
    assert(state.status === 'running', 'Lauf läuft weiter');
    assert(state.totalFails === 1, 'Fehlversuche des Laufs bleiben erhalten');
    assert(await g.eval(() => window.__EDU_DEBUG.getChapterScene().chapterFails === 0), 'chapterFails zurückgesetzt');
    assert(!(await g.eval(() => window.__EDU_DEBUG.getScene('HUD').isPauseOverlayVisible())), 'Overlay weg');
    assert((await g.eval(() => window.__EDU_DEBUG.getPhase())) === 'playing', 'Phase playing');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: „Hauptmenü“ bricht den Lauf ab', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, query: 'chapter=2&skipintro=1' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));
    await clickButton(g, 'HUD', 'pause');
    await g.waitFor(() => window.__EDU_DEBUG.getScene('HUD').isPauseOverlayVisible());
    await clickButton(g, 'HUD', 'menu');
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    await g.wait(200);
    const active = await g.eval(() => window.__EDU_DEBUG.getActiveScenes());
    assert(!active.includes('HUD') && !active.includes('Game'), `nur Menü aktiv (${active.join(', ')})`);
    assert(!active.some((key) => key.startsWith('Ch')), 'kein Kapitel aktiv');
    assert(!(await g.eval(() => window.__EDU_DEBUG.game.scene.getScenes(false).some((s) => s.sys.isPaused()))), 'keine pausierte Szene übrig');
    const state = await g.state();
    assert(state.status === 'aborted', `status aborted (${state.status})`);
    assert(state.paused === false, 'nicht mehr pausiert');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: Rage-Quit im Kapitel (setFrustration(100)) → GameOver verloren → Hauptmenü', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, query: 'chapter=2&skipintro=1' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));
    await g.eval(() => window.__EDU_DEBUG.setFrustration(100));
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('GameOver'), null, { timeout: RAGE_TIMEOUT_MS });
    const state = await g.state();
    assert(state.status === 'lost', `status lost (${state.status})`);
    const active = await g.eval(() => window.__EDU_DEBUG.getActiveScenes());
    assert(!active.includes('HUD') && !active.includes('Game'), `HUD/Game beendet (${active.join(', ')})`);
    const result = await g.eval(() => window.__EDU_DEBUG.getScene('GameOver').result);
    assert(result.won === false, 'Ergebnis: verloren');
    const rageEvents = await g.eval(() => window.__EDU_DEBUG.events.filter((e) => e.event === EVENTS.RAGE_QUIT).length);
    assert(rageEvents === 1, `genau ein RAGE_QUIT (${rageEvents})`);
    await g.waitFor(() => window.__EDU_DEBUG.getScene('GameOver').isScoreDone === true, null, { timeout: 6000 });
    await g.wait(500);
    await g.shot('scenes-gameover-lost');

    await clickButton(g, 'GameOver', 'menu');
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: Rage-Quit während der Titelkarte → GameOver verloren', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, query: 'chapter=2' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getPhase() === 'intro');
    await g.eval(() => window.__EDU_DEBUG.setFrustration(100));
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('GameOver'), null, { timeout: RAGE_TIMEOUT_MS });
    assert((await g.state()).status === 'lost', 'verloren');
    await g.wait(400);
    const active = await g.eval(() => window.__EDU_DEBUG.getActiveScenes());
    assert(!active.some((key) => key.startsWith('Ch')), `kein Kapitel gestartet (${active.join(', ')})`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: ?chapter=3&skipintro=1 startet direkt Kapitel 3', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, query: 'chapter=3&skipintro=1' });
  try {
    const active = await g.eval(() => window.__EDU_DEBUG.getActiveScenes());
    assert(active.includes('Ch3SignalHunt'), `Kapitel 3 aktiv (${active.join(', ')})`);
    assert(active.includes('HUD') && active.includes('Game'), 'HUD und Game aktiv');
    assert(!active.includes('Menu') && !active.includes('Boot'), 'kein Menü/Boot');
    const state = await g.state();
    assert(state.currentChapterId === 3, `currentChapterId 3 (${state.currentChapterId})`);
    assert(state.status === 'running', 'Lauf läuft');
    assert((await g.eval(() => window.__EDU_DEBUG.getPhase())) === 'playing', 'Phase playing');
    const hudLabel = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').chapterText.text);
    assert(hudLabel.startsWith('Kapitel 3 von 5'), `HUD zeigt Kapitel 3 (${hudLabel})`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: Kapitelwahl ohne Freischaltung – nur Kapitel 1 wählbar', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    await clickButton(g, 'Menu', 'chapters');
    await g.waitFor(() => window.__EDU_DEBUG.getScene('Menu').getOverlayKind() === 'chapters');
    await g.wait(250);
    await g.shot('scenes-chapter-select-locked');
    await clickButton(g, 'Menu', 'chapter-3');
    await g.wait(300);
    assert(await g.eval(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu')), 'gesperrtes Kapitel startet nicht');
    await g.press('Escape');
    await g.waitFor(() => window.__EDU_DEBUG.getScene('Menu').getOverlayKind() === null);

    await clickButton(g, 'Menu', 'achievements');
    await g.waitFor(() => window.__EDU_DEBUG.getScene('Menu').getOverlayKind() === 'achievements');
    await g.wait(250);
    await g.shot('scenes-achievements');
    await clickButton(g, 'Menu', 'overlay-close');
    await g.waitFor(() => window.__EDU_DEBUG.getScene('Menu').getOverlayKind() === null);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: Kapitelwahl mit ?unlock=all → Kapitel 4, Escape-Pause im Intro', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, query: 'unlock=all' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    await g.waitFor(() => window.__EDU_DEBUG.getScene('Menu').isIntroDone === true, null, { timeout: 6000 });
    await clickButton(g, 'Menu', 'chapters');
    await g.waitFor(() => window.__EDU_DEBUG.getScene('Menu').getOverlayKind() === 'chapters');
    await g.wait(250);
    await g.shot('scenes-chapter-select');
    await clickButton(g, 'Menu', 'chapter-4');
    await g.waitFor(() => window.__EDU_DEBUG.getPhase() === 'intro');
    const state = await g.state();
    assert(state.currentChapterId === 4, `Kapitel 4 (${state.currentChapterId})`);

    // Escape pausiert auch im Intro, Escape setzt fort
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));
    await g.press('Escape');
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === true);
    await g.waitFor(() => window.__EDU_DEBUG.getScene('HUD').isPauseOverlayVisible());
    await g.press('Escape');
    await g.waitFor(() => window.__EDU_DEBUG.getState().paused === false);

    assert(await g.eval(() => window.__EDU_DEBUG.skipIntro()), 'skipIntro() startet das Kapitel');
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Ch4Certificate'));
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: doppeltes CHAPTER_COMPLETE wird ignoriert (Kapitel 1 → 2, nicht 3)', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, query: 'chapter=1&skipintro=1' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));
    await g.eval(() => {
      GameState.completeChapter(1, { fails: 0 });
      GameState.completeChapter(1, { fails: 0 });
    });
    await g.waitFor(() => window.__EDU_DEBUG.getState().currentChapterId === 2
      && window.__EDU_DEBUG.getActiveScenes().includes('Ch2Config'), null, { timeout: 5000 });
    await g.wait(1200);
    const state = await g.state();
    assert(state.currentChapterId === 2, `bleibt in Kapitel 2 (${state.currentChapterId})`);
    const active = await g.eval(() => window.__EDU_DEBUG.getActiveScenes());
    assert(!active.includes('Ch1Registration') && !active.includes('Ch3SignalHunt'), `nur Kapitel 2 (${active.join(', ')})`);
    assert(await g.eval(() => Storage.getUnlockedChapter() >= 2), 'Kapitel 2 freigeschaltet');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: HUD – Frust-Puls, Gesicht, Zeitsprung, „zu spät“, Meilenstein- und Erfolgs-Banner', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, query: 'chapter=1&skipintro=1' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));
    // Frust-Anstieg → Balken pulsiert rot, Gesicht wechselt
    await g.eval(() => GameState.addFrustration(45, 'Test'));
    await g.waitFor(() => window.__EDU_DEBUG.getScene('HUD').barPulse.alpha > 0.2, null, { timeout: 2000 });
    const hud = await g.eval(() => {
      const scene = window.__EDU_DEBUG.getScene('HUD');
      return { percent: scene.percentText.text, face: scene.face.texture ? scene.face.texture.key : null };
    });
    assert(hud.percent === '45 %', `Prozentanzeige (${hud.percent})`);
    assert(hud.face === null || hud.face === 'face-2', `Gesicht face-2 (${hud.face})`);

    // Lange Aufgabe → verkleinert/gekürzt, beim Überfahren vollständig als Tooltip
    await g.eval(() => GameState.setObjective('Melde dich mit Kennung und Initialpasswort aus dem Begrüßungsbrief im Self-Service-Portal an'));
    const objective = await g.eval(() => {
      const scene = window.__EDU_DEBUG.getScene('HUD');
      return { text: scene.objectiveText.text, isTruncated: scene.isObjectiveTruncated, width: scene.objectiveText.width };
    });
    assert(objective.isTruncated && objective.text.endsWith('…'), `Aufgabe gekürzt (${objective.text})`);
    assert(objective.width <= 312, `Aufgabe passt in die Leiste (${objective.width})`);
    await g.move(120, 30);
    await g.waitFor(() => window.__EDU_DEBUG.getScene('HUD').objectiveTooltip !== null, null, { timeout: 2000 });
    await g.shot('scenes-hud-tooltip');
    await g.move(400, 560);
    await g.waitFor(() => window.__EDU_DEBUG.getScene('HUD').objectiveTooltip === null, null, { timeout: 2000 });

    // Erfolg → Banner mit Titel
    await g.eval(() => GameState.unlockAchievement('CAPTCHA_HUMAN'));
    await g.waitFor(() => {
      const banner = window.__EDU_DEBUG.getScene('HUD').activeBanner;
      return Boolean(banner) && banner.y >= 50;
    }, null, { timeout: 3000 });
    await g.wait(150);
    await g.shot('scenes-hud-achievement');

    // Zeitsprung über 08:15 → Meilensteine (Banner-Warteschlange), Uhr rot, „+N min zu spät“
    await g.eval(() => window.__EDU_DEBUG.addMinutes(57));
    await g.wait(250);
    await g.shot('scenes-hud-clockjump');
    const late = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').clockSubText.text);
    assert(late === '+12 min zu spät', `Verspätung angezeigt (${late})`);
    const milestones = await g.eval(() => window.__EDU_DEBUG.events.filter((e) => e.event === EVENTS.CLOCK_MILESTONE).length);
    assert(milestones === 2, `zwei Meilensteine (08:00, 08:15) ausgelöst (${milestones})`);
    await g.waitFor(() => {
      const banner = window.__EDU_DEBUG.getScene('HUD').activeBanner;
      return Boolean(banner) && banner.list.some((o) => o.text && o.text.startsWith('08:00')) && banner.y >= 50;
    }, null, { timeout: 8000 });
    await g.wait(150);
    await g.shot('scenes-hud-milestone');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: Ton-Button im Menü schaltet um und merkt sich die Einstellung', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, mute: false });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    const before = await g.eval(() => window.__EDU_DEBUG.getScene('Menu').soundLabel());
    assert(before === 'Ton aus', `Startzustand „Ton aus“ (${before})`);
    await clickButton(g, 'Menu', 'sound');
    const after = await g.eval(() => ({ label: window.__EDU_DEBUG.getScene('Menu').soundLabel(), muted: SFX.isMuted(), stored: Storage.getSettings().muted }));
    assert(after.label === 'Ton an' && after.muted === true && after.stored === true, `stumm geschaltet (${JSON.stringify(after)})`);
    await clickButton(g, 'Menu', 'sound');
    assert((await g.eval(() => SFX.isMuted())) === false, 'wieder laut');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('flow: ChapterScene-API mit Test-Kapitel (listen, onKey, fail, penalty, relief, succeed, Cleanup)', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    // Test-Kapitel anstelle von Kapitel 2 registrieren (an derselben Stelle der Szenenliste)
    await g.eval(() => {
      class TestChapterScene extends ChapterScene {
        constructor() {
          super(2);
        }
        create() {
          this.initChapter({ background: CONFIG.COLORS.BG_ALT });
          this.setObjective('Testaufgabe');
          this.heardJumps = [];
          this.pressedKeys = [];
          this.listen(EVENTS.CLOCK_JUMP, (payload) => this.heardJumps.push(payload.minutes));
          this.onKey((event) => this.pressedKeys.push(event.key));
        }
        debugSolve() {
          this.succeed({ solvedBy: 'test' });
        }
      }
      window.__TestChapterScene = TestChapterScene;
      const manager = window.__EDU_DEBUG.game.scene;
      manager.remove('Ch2Config');
      manager.add('Ch2Config', TestChapterScene, false);
      manager.moveBelow('Ch3SignalHunt', 'Ch2Config'); // B wird direkt unter A einsortiert
      window.__EDU_DEBUG.startChapter(2);
    });
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene() instanceof window.__TestChapterScene
      && window.__EDU_DEBUG.getActiveScenes().includes('Ch2Config'));
    const order = await g.eval(() => window.__EDU_DEBUG.game.scene.scenes.map((s) => s.sys.settings.key));
    assert(order.indexOf('Ch2Config') < order.indexOf('HUD'), `Kapitel liegt unter dem HUD (${order.join(', ')})`);

    const basics = await g.eval(() => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      return { area: scene.area, isFinished: scene.isFinished, fails: scene.chapterFails, start: scene.chapterStartMinutes,
        title: scene.chapter.title, objective: GameState.getSnapshot().objective };
    });
    assert(basics.area.y === 48 && basics.area.height === 552, 'area = PLAY_AREA');
    assert(basics.isFinished === false && basics.fails === 0 && basics.start === 450, `Felder initialisiert (${JSON.stringify(basics)})`);
    assert(basics.title === 'Die Konfiguration' && basics.objective === 'Testaufgabe', 'chapter/setObjective');

    // penalty, relief, fail
    const afterFeedback = await g.eval(() => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      scene.penalty(5, 'Fehlermeldung gegoogelt');
      GameState.addFrustration(10, 'Test');
      scene.relief(4, 'Brezel');
      scene.fail('Falsches Passwort', { minutes: 2, x: 400, y: 560 });
      return { state: GameState.getSnapshot(), jumps: [...scene.heardJumps], fails: scene.chapterFails };
    });
    assert(afterFeedback.state.clockMinutes === 457, `Uhr +5 +2 (${afterFeedback.state.clockMinutes})`);
    assert(afterFeedback.state.frustration === 14, `Frust 10 − 4 + 8 = 14 (${afterFeedback.state.frustration})`);
    assert(afterFeedback.state.totalFails === 1 && afterFeedback.fails === 1, 'Fehlversuch gebucht');
    assert(JSON.stringify(afterFeedback.jumps) === '[5,2]', `listen() hört CLOCK_JUMP (${JSON.stringify(afterFeedback.jumps)})`);
    await g.wait(250);
    await g.shot('scenes-chapter-api-fail');

    // onKey, toast, showModal, achievement
    await g.press('a');
    await g.waitFor(() => window.__EDU_DEBUG.getChapterScene().pressedKeys.includes('a'));
    const widgets = await g.eval(() => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      const toast = scene.toast('Gespeichert');
      const modal = scene.showModal({ title: 'Test', text: 'Hallo', buttons: [{ text: 'OK' }] });
      const isOpen = UI.Modal.isAnyOpen(scene);
      modal.close();
      const isNew = scene.achievement('ANON_IDENTITY');
      return { hasToast: Boolean(toast), isOpen, isNew, achievements: GameState.getSnapshot().runAchievements };
    });
    assert(widgets.hasToast && widgets.isOpen, `toast/showModal (${JSON.stringify(widgets)})`);
    assert(widgets.isNew && widgets.achievements.includes('ANON_IDENTITY'), 'achievement()');

    // succeed ist idempotent, fail danach wird ignoriert, Abschluss nach CHAPTER_END_DELAY
    const succeed = await g.eval(() => {
      const scene = window.__EDU_DEBUG.getChapterScene();
      const first = scene.succeed({ extra: 1 });
      const second = scene.succeed();
      scene.fail('zu spät');
      return { first, second, totalFails: GameState.getSnapshot().totalFails };
    });
    assert(succeed.first === true && succeed.second === false, 'succeed() idempotent');
    assert(succeed.totalFails === 1, 'fail() nach succeed() wird ignoriert');
    await g.waitFor(() => window.__EDU_DEBUG.events.some((e) => e.event === EVENTS.CHAPTER_COMPLETE), null, { timeout: 4000 });
    const complete = await g.eval(() => window.__EDU_DEBUG.events.find((e) => e.event === EVENTS.CHAPTER_COMPLETE).payload);
    assert(complete.chapterId === 2 && complete.stats.fails === 1 && complete.stats.extra === 1
      && typeof complete.stats.minutesSpent === 'number', `CHAPTER_COMPLETE-Statistik (${JSON.stringify(complete)})`);

    // Kapitelwechsel → Test-Kapitel gestoppt → Listener abgemeldet
    await g.waitFor(() => window.__EDU_DEBUG.getState().currentChapterId === 3
      && window.__EDU_DEBUG.getSceneStatus('Ch2Config') === 'shutdown', null, { timeout: 5000 });
    const cleanup = await g.eval(() => {
      const scene = window.__EDU_DEBUG.getScene('Ch2Config');
      const before = scene.heardJumps.length;
      GameState.advanceClock(1, 'nach dem Kapitel');
      return { before, after: scene.heardJumps.length };
    });
    assert(cleanup.after === cleanup.before, `GameState-Listener nach shutdown abgemeldet (${JSON.stringify(cleanup)})`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});
