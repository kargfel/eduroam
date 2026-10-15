/**
 * full-run.mjs – Ein kompletter Lauf (Bereich „scenes“).
 *
 * Neues Spiel (echter Klick) → für jedes Kapitel: Titelkarte fotografieren, skipIntro(),
 * HUD fotografieren, solve() → GameOver gewonnen. Prüft Highscore in localStorage,
 * Freischaltung aller Kapitel und „Nochmal“ per Enter (neuer Lauf ab 07:30).
 * Funktioniert mit Platzhalter- und mit echten Kapiteln (debugSolve darf dauern).
 *
 * Aufruf: node tests/e2e/full-run.mjs
 */
import { launchGame, runTest, assert } from './harness.mjs';

/** Optional: E2E_IGNORE="datei1.js,datei2.js" ignoriert Browser-Fehler aus fremden Baustellen. */
const IGNORE_ERRORS = (process.env.E2E_IGNORE || '').split(',').map((s) => s.trim()).filter(Boolean);

const CHAPTER_TIMEOUT_MS = 90000; // echte Kapitel lösen sich evtl. „wie ein Mensch“

await runTest('full-run: Neues Spiel → Kapitel 1–5 per solve() → GameOver gewonnen', async () => {
  const g = await launchGame({ ignoreErrors: IGNORE_ERRORS, query: 'seed=42' });
  try {
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    const chapterKeys = await g.eval(() => CONFIG.CHAPTERS.map((chapter) => chapter.key));
    const placeholders = await g.eval(() => window.__EDU_DEBUG.placeholderChapters);
    console.log(`      Platzhalter-Kapitel: ${placeholders.length ? placeholders.join(', ') : 'keine'}`);

    const newGame = await g.eval(() => window.__EDU_DEBUG.getScene('Menu').getButtonCenter('newGame'));
    await g.click(newGame.x, newGame.y);

    for (let n = 1; n <= chapterKeys.length; n += 1) {
      await g.waitFor((id) => window.__EDU_DEBUG.getPhase() === 'intro'
        && window.__EDU_DEBUG.getState().currentChapterId === id, n, { timeout: CHAPTER_TIMEOUT_MS });

      // Typewriter per Leertaste beenden (nur solange noch getippt wird), dann fotografieren
      if (await g.eval(() => window.__EDU_DEBUG.getScene('Game').isIntroTyping())) await g.press('Space');
      await g.waitFor(() => !window.__EDU_DEBUG.getScene('Game').isIntroTyping());
      const clockInIntro = (await g.state()).clockMinutes;
      await g.wait(350);
      await g.shot(`scenes-intro-${n}`);
      assert((await g.state()).clockMinutes === clockInIntro, `Kapitel ${n}: Uhr steht im Intro`);

      assert(await g.eval(() => window.__EDU_DEBUG.skipIntro()), `Kapitel ${n}: skipIntro() startet das Kapitel`);
      await g.waitFor((key) => {
        const scene = window.__EDU_DEBUG.getChapterScene();
        return Boolean(scene) && scene.sys.settings.key === key && window.__EDU_DEBUG.getActiveScenes().includes(key);
      }, chapterKeys[n - 1], { timeout: 15000 });
      await g.wait(500);
      await g.shot(`scenes-hud-${n}`);

      // solve() bewusst ohne Rückgabewert: ein evtl. Promise soll den Test nicht blockieren
      await g.eval(() => {
        window.__EDU_DEBUG.solve();
      });
    }

    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('GameOver'), null, { timeout: CHAPTER_TIMEOUT_MS });
    const state = await g.state();
    assert(state.status === 'won', `Lauf gewonnen (status ${state.status})`);
    const result = await g.eval(() => window.__EDU_DEBUG.getScene('GameOver').result);
    assert(result.won === true && result.score > 0, `Ergebnis gewonnen mit Punkten (${result.score})`);
    const completes = await g.eval(() => window.__EDU_DEBUG.events.filter((e) => e.event === EVENTS.CHAPTER_COMPLETE).length);
    assert(completes === chapterKeys.length, `${chapterKeys.length} × CHAPTER_COMPLETE (${completes})`);

    await g.waitFor(() => window.__EDU_DEBUG.getScene('GameOver').isScoreDone === true, null, { timeout: 8000 });
    await g.wait(700);
    await g.shot('scenes-gameover-won');

    // Highscore und Freischaltung liegen in localStorage
    const stored = await g.eval(() => {
      const keys = Object.keys(localStorage).filter((key) => key.startsWith(CONFIG.STORAGE_PREFIX));
      return {
        highscore: Storage.getHighscore(),
        unlocked: Storage.getUnlockedChapter(),
        raw: keys.map((key) => localStorage.getItem(key)),
      };
    });
    assert(stored.highscore && stored.highscore.score === result.score, `Highscore gespeichert (${JSON.stringify(stored.highscore)})`);
    assert(stored.raw.some((value) => value.includes(String(result.score))), 'Highscore steht in localStorage');
    assert(stored.unlocked === chapterKeys.length, `alle Kapitel freigeschaltet (${stored.unlocked})`);

    // „Nochmal“ per Enter → neuer Lauf, Uhr wieder 07:30
    await g.press('Enter');
    await g.waitFor(() => window.__EDU_DEBUG.getPhase() === 'intro' && window.__EDU_DEBUG.getState().status === 'running');
    const fresh = await g.state();
    const startMinutes = await g.eval(() => CONFIG.CLOCK.START_MINUTES);
    assert(fresh.clockMinutes === startMinutes, `neuer Lauf startet um 07:30 (${fresh.clockMinutes})`);
    assert(fresh.currentChapterId === 1 && fresh.totalFails === 0, 'neuer Lauf ab Kapitel 1 ohne Fehlversuche');

    // Hauptmenü zeigt den Highscore
    await g.eval(() => window.__EDU_DEBUG.getScene('Game').quitToMenu());
    await g.waitFor(() => window.__EDU_DEBUG.getActiveScenes().includes('Menu'));
    const line = await g.eval(() => window.__EDU_DEBUG.getScene('Menu').highscoreText.text);
    assert(line.startsWith('Highscore:'), `Menü zeigt Highscore (${line})`);
    await g.wait(300);
    await g.shot('scenes-menu-highscore');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});
