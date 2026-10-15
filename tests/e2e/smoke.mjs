/**
 * smoke.mjs – Rauchtest des Szenenflusses (Bereich „scenes“).
 *
 * Boot → Menü bereit (Screenshot, keine Fehler) → „Neues Spiel“ per echtem Klick →
 * Titelkarte (Uhr steht) → „Los geht's“ per Klick → Kapitel 1 aktiv, HUD sichtbar, Uhr läuft.
 * Funktioniert mit Platzhalter- und mit echten Kapiteln.
 *
 * Aufruf: node tests/e2e/smoke.mjs
 */
import { launchGame, runTest, assert } from './harness.mjs';

/** Optional: E2E_IGNORE="datei1.js,datei2.js" ignoriert Browser-Fehler aus fremden Baustellen. */
const IGNORE_ERRORS = (process.env.E2E_IGNORE || '').split(',').map((s) => s.trim()).filter(Boolean);

/** Mitte eines registrierten Buttons einer Szene (Spielkoordinaten). */
async function buttonCenter(g, sceneKey, id) {
  const center = await g.eval(([key, buttonId]) => {
    const scene = window.__EDU_DEBUG.getScene(key);
    return scene && scene.getButtonCenter ? scene.getButtonCenter(buttonId) : null;
  }, [sceneKey, id]);
  assert(center, `Button „${id}“ in Szene ${sceneKey} gefunden`);
  return center;
}

await runTest('smoke: Boot → Menü → Neues Spiel → Intro → Kapitel 1 mit HUD und laufender Uhr', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS });
  try {
    // Menü läuft, Lade-Moment (Stempel) abgeschlossen
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    await g.waitFor(() => window.__EDU_DEBUG.getScene('Menu').isIntroDone === true, null, { timeout: 6000 });
    await g.wait(450);
    await g.shot('scenes-menu');
    const scenesInMenu = await g.eval(() => window.__EDU_DEBUG.getActiveScenes());
    assert(!scenesInMenu.includes('HUD'), 'Im Menü läuft kein HUD');
    assert(!scenesInMenu.includes('Boot'), 'Boot ist beendet');
    const highscoreLine = await g.eval(() => window.__EDU_DEBUG.getScene('Menu').highscoreText.text);
    assert(highscoreLine.length > 0, 'Highscore-Zeile vorhanden');

    // „Neues Spiel“ per Klick
    const newGame = await buttonCenter(g, 'Menu', 'newGame');
    await g.click(newGame.x, newGame.y);
    await g.waitFor(() => window.__EDU_DEBUG.getPhase() === 'intro');
    const introState = await g.state();
    assert(introState.status === 'running', `Lauf läuft (status ${introState.status})`);
    assert(introState.currentChapterId === 1, `Kapitel 1 (ist ${introState.currentChapterId})`);
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('HUD'));

    // Uhr steht während der Titelkarte
    await g.wait(1300);
    const introLater = await g.state();
    assert(introLater.clockMinutes === introState.clockMinutes, 'Uhr steht während des Intros');
    await g.shot('scenes-intro-typing');

    // „Los geht's“ per Klick
    const go = await g.eval(() => window.__EDU_DEBUG.getScene('Game').getIntroButtonCenter());
    assert(go, 'Los-geht’s-Button vorhanden');
    await g.click(go.x, go.y);
    await g.waitFor(() => {
      const active = window.__EDU_DEBUG.getActiveScenes();
      return active.includes('Ch1Registration') && active.includes('HUD');
    });
    assert((await g.eval(() => window.__EDU_DEBUG.getPhase())) === 'playing', 'Phase playing');
    const hudLabel = await g.eval(() => window.__EDU_DEBUG.getScene('HUD').chapterText.text);
    assert(hudLabel.startsWith('Kapitel 1 von 5'), `HUD zeigt Kapitel (${hudLabel})`);
    const chapterScene = await g.eval(() => window.__EDU_DEBUG.getChapterScene().sys.settings.key);
    assert(chapterScene === 'Ch1Registration', `getChapterScene() liefert Kapitel 1 (${chapterScene})`);

    // Uhr läuft (4 s Echtzeit = 1 Spielminute)
    const t0 = (await g.state()).clockMinutes;
    await g.waitFor((start) => window.__EDU_DEBUG.getState().clockMinutes > start, t0, { timeout: 9000 });
    await g.shot('scenes-chapter1-hud');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});
