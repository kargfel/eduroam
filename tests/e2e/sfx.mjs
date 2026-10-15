/**
 * sfx.mjs – Browser-Test für SFX (src/audio/sfx.js) mit echtem WebAudio in Chromium.
 *
 * Seite: tests/pages/sfx.html (ohne Phaser, ohne Canvas → Nutzergeste per
 * g.page.mouse.click statt g.click). Geprüft wird:
 *  1. Vor der Geste: jede Methode einmal aufgerufen, nichts geworfen, kein AudioContext.
 *  2. Nach der Geste: AudioContext läuft, alle Klänge werden gespielt, 0 verschluckte Fehler.
 *  3. Warteschleife: plant taktweise über die Audio-Uhr nach, stoppt sauber, Stumm pausiert sie.
 *  4. Stummschaltung (Settings und RUNTIME.muted) unterdrückt Klänge.
 *  5. Zu frühes unlock() (vor jeder Geste) ist harmlos.
 * Aufruf: node tests/e2e/sfx.mjs
 */
import { launchGame, runTest, assert } from './harness.mjs';

const PAGE = 'tests/pages/sfx.html';
const READY = () => window.__GALLERY_READY === true;
const AUDIO_TIMEOUT = { timeout: 5000 };

/** Öffnet die Galerie hörbar (mute: false) und entsperrt den Ton per echter Mausgeste. */
async function openUnlocked() {
  const g = await launchGame({ page: PAGE, mute: false, ready: READY });
  await g.page.mouse.click(10, 10);
  await g.waitFor(() => SFX.getDebugInfo().contextState === 'running', null, AUDIO_TIMEOUT);
  return g;
}

await runTest('SFX – alle Methoden ohne Fehler, vor und nach der Nutzergeste', async () => {
  const g = await launchGame({ page: PAGE, mute: false, ready: READY });
  try {
    const pre = await g.eval(() => window.__SFX_PRELOAD);
    assert(pre.thrown.length === 0, `vor der Geste geworfen: ${pre.thrown.join(', ')}`);
    assert(pre.info.errors === 0, `verschluckte Fehler vor der Geste: ${pre.info.lastError}`);
    assert(pre.info.hasContext === false, 'vor der Nutzergeste darf kein AudioContext entstehen');
    assert(pre.muted === false, 'Galerie muss hörbar sein');
    const soundNames = await g.eval(() => SFX.SOUND_NAMES);
    assert(soundNames.length === 18, `18 Klänge laut Vertrag erwartet, gefunden: ${soundNames.length}`);
    for (const name of soundNames) assert(pre.called.includes(name), `${name} wurde nicht aufgerufen`);

    await g.page.mouse.click(10, 10);
    await g.waitFor(() => window.__SFX_UNLOCKED === true, null, AUDIO_TIMEOUT);
    const result = await g.eval(() => window.__playAllSounds());
    assert(result.thrown.length === 0, `geworfen: ${result.thrown.join(', ')}`);
    assert(result.info.errors === 0, `verschluckte Audio-Fehler: ${result.info.lastError}`);
    assert(
      result.info.played >= result.soundCount,
      `nur ${result.info.played} von ${result.soundCount} Klängen gespielt`
    );
    await g.wait(600); // Ausklingen lassen (onended räumt Knoten ab)
    await g.shot('core-sfx-gallery');
    const after = await g.eval(() => SFX.getDebugInfo());
    assert(after.errors === 0, `Fehler beim Ausklingen: ${after.lastError}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('SFX – Warteschleife plant taktweise nach und stoppt sauber', async () => {
  const g = await openUnlocked();
  try {
    await g.eval(() => {
      SFX.startHoldMusic();
      SFX.startHoldMusic(); // idempotent
    });
    const started = await g.eval(() => SFX.getDebugInfo());
    assert(started.holdMusicActive, 'Warteschleife sollte laufen');
    assert(started.holdMusicSources > 0, 'es sollten Noten geplant sein');
    await g.waitFor(() => SFX.getDebugInfo().holdMusicBars >= 4, null, { timeout: 8000 });

    await g.eval(() => SFX.stopHoldMusic());
    await g.wait(400);
    const stopped = await g.eval(() => SFX.getDebugInfo());
    assert(!stopped.holdMusicActive && !stopped.holdMusicWanted, 'Warteschleife sollte aus sein');
    assert(stopped.holdMusicSources === 0, `noch ${stopped.holdMusicSources} Quellen aktiv`);
    await g.wait(1500);
    const later = await g.eval(() => SFX.getDebugInfo());
    assert(later.holdMusicBars === stopped.holdMusicBars, 'nach dem Stopp wurde weiter geplant');

    // Stumm während der Warteschleife: Wiedergabe pausiert, Wunsch bleibt; laut → läuft wieder.
    const muted = await g.eval(() => {
      SFX.startHoldMusic();
      SFX.setMuted(true);
      return SFX.getDebugInfo();
    });
    assert(!muted.holdMusicActive && muted.holdMusicWanted, 'stumm: Wiedergabe aus, Wunsch bleibt');
    const unmuted = await g.eval(() => {
      SFX.setMuted(false);
      return SFX.getDebugInfo();
    });
    assert(unmuted.holdMusicActive, 'laut: Warteschleife läuft wieder');

    // Sicherheitsnetz: Lauf endet → Warteschleife stoppt von selbst.
    const afterRunEnd = await g.eval(() => {
      GameState.startRun(5);
      GameState.abortRun();
      return SFX.getDebugInfo();
    });
    assert(!afterRunEnd.holdMusicWanted && !afterRunEnd.holdMusicActive, 'Laufende stoppt die Warteschleife');
    const final = await g.eval(() => SFX.getDebugInfo());
    assert(final.errors === 0, `verschluckte Fehler: ${final.lastError}`);
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('SFX – Stummschaltung (Settings und RUNTIME.muted) unterdrückt Klänge', async () => {
  const g = await openUnlocked();
  try {
    const result = await g.eval(() => {
      const played = () => SFX.getDebugInfo().played;
      const log = {};
      const start = played();
      SFX.setMuted(true);
      SFX.click();
      log.mutedSetting = played() - start;
      log.storedMuted = Storage.getSettings().muted;
      SFX.setMuted(false);
      RUNTIME.muted = true;
      SFX.click();
      log.mutedRuntime = played() - start;
      log.storedAfterRuntime = Storage.getSettings().muted;
      log.isMutedRuntime = SFX.isMuted();
      RUNTIME.muted = false;
      SFX.click();
      log.audible = played() - start;
      return log;
    });
    assert(result.mutedSetting === 0, 'stumm (Settings) darf nichts spielen');
    assert(result.storedMuted === true, 'setMuted muss in Storage speichern');
    assert(result.mutedRuntime === 0, 'RUNTIME.muted darf nichts spielen');
    assert(result.isMutedRuntime === true, 'isMuted() muss RUNTIME.muted berücksichtigen');
    assert(result.storedAfterRuntime === false, 'RUNTIME.muted darf die Settings nicht überschreiben');
    assert(result.audible === 1, 'wieder laut: genau ein Klang');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});

await runTest('SFX – zu frühes unlock() vor jeder Geste ist harmlos', async () => {
  const g = await launchGame({ page: PAGE, mute: false, ready: READY });
  try {
    // Nicht auf das Promise warten: ohne Nutzergeste darf resume() im Browser hängen bleiben.
    const early = await g.eval(() => {
      const pending = SFX.unlock();
      SFX.click();
      SFX.stamp();
      return { isThenable: Boolean(pending && typeof pending.then === 'function'), info: SFX.getDebugInfo() };
    });
    assert(early.isThenable, 'unlock() muss ein Promise liefern');
    assert(early.info.errors === 0, `Fehler beim frühen unlock: ${early.info.lastError}`);
    await g.page.mouse.click(10, 10);
    await g.waitFor(() => SFX.getDebugInfo().contextState === 'running', null, AUDIO_TIMEOUT);
    const played = await g.eval(() => {
      const before = SFX.getDebugInfo().played;
      SFX.success();
      return SFX.getDebugInfo().played - before;
    });
    assert(played === 1, 'nach der Geste muss Ton laufen');
    g.assertNoErrors();
  } finally {
    await g.close();
  }
});
