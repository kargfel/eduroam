/**
 * main.js – Startpunkt: URL-Parameter → RUNTIME, Phaser-Spiel, Debug-API.
 *
 * URL: ?chapter=N (direkt in Kapitel N), ?skipintro=1, ?mute=1, ?seed=S, ?unlock=all.
 * Szenen-Reihenfolge = Zeichenreihenfolge: Boot, Menu, Game, Kapitel 1–5, HUD, GameOver
 * (das HUD liegt über den Kapiteln). Fehlt eine Kapitel-Klasse noch, springt
 * makePlaceholderChapter(N) ein – der Ablauf bleibt immer spielbar.
 *
 * window.__EDU_DEBUG (für Tests und Präsentation): ready, game, events (Protokoll aller
 * GameState-Events), getState, getActiveScenes, getChapterScene, startChapter, skipIntro,
 * solve, setFrustration, addMinutes – plus Zusätze (getPhase, getScene, getSceneStatus …).
 *
 * Globals: keine (alles in einer IIFE), setzt window.__EDU_DEBUG.
 * Abhängigkeiten: alle vorher geladenen Scripts (siehe index.html).
 */

(() => {
  /** Höchstzahl gespeicherter Events; ältere STATE_CHANGED-Einträge fliegen zuerst raus. */
  const MAX_EVENT_LOG = 1500;
  const STATUS_NAMES = ['pending', 'init', 'start', 'loading', 'creating', 'running', 'paused', 'sleeping', 'shutdown', 'destroyed'];

  // ---------------------------------------------------------------------------
  // 1. URL-Parameter → RUNTIME (bevor das Spiel startet)
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const isOn = (name) => params.has(name) && !['0', 'false', 'no', 'off'].includes(String(params.get(name)).toLowerCase());

  const chapterParam = Number.parseInt(params.get('chapter'), 10);
  if (Number.isInteger(chapterParam) && chapterParam >= 1 && chapterParam <= CONFIG.CHAPTERS.length) {
    RUNTIME.startChapter = chapterParam;
  }
  RUNTIME.skipIntro = isOn('skipintro');
  RUNTIME.muted = isOn('mute');
  if (params.has('seed') && params.get('seed') !== '') {
    const seed = params.get('seed');
    RUNTIME.seed = /^-?\d+$/.test(seed) ? Number(seed) : seed;
  }
  RUNTIME.unlockAll = String(params.get('unlock') || '').toLowerCase() === 'all';

  // ---------------------------------------------------------------------------
  // 2. Szenen (echte Kapitel, sonst Platzhalter)
  // ---------------------------------------------------------------------------
  const chapterClasses = [
    typeof Ch1RegistrationScene !== 'undefined' ? Ch1RegistrationScene : makePlaceholderChapter(1),
    typeof Ch2ConfigScene !== 'undefined' ? Ch2ConfigScene : makePlaceholderChapter(2),
    typeof Ch3SignalHuntScene !== 'undefined' ? Ch3SignalHuntScene : makePlaceholderChapter(3),
    typeof Ch4CertificateScene !== 'undefined' ? Ch4CertificateScene : makePlaceholderChapter(4),
    typeof Ch5HelpdeskScene !== 'undefined' ? Ch5HelpdeskScene : makePlaceholderChapter(5),
  ];

  // ---------------------------------------------------------------------------
  // 3. Debug-API (vor dem Spielstart, damit Tests sofort darauf warten können)
  // ---------------------------------------------------------------------------
  const debug = {
    ready: false,
    game: null,
    events: [],

    /** @returns {object} GameState.getSnapshot() */
    getState: () => GameState.getSnapshot(),

    /** @returns {string[]} Keys der laufenden Szenen (status 'running') */
    getActiveScenes: () => (debug.game ? debug.game.scene.getScenes(true).map((scene) => scene.sys.settings.key) : []),

    /** @returns {ChapterScene|null} laufende oder pausierte Kapitel-Szene */
    getChapterScene: () => {
      const gameScene = getGameScene();
      const fromRun = gameScene ? gameScene.getActiveChapterScene() : null;
      if (fromRun) return fromRun;
      if (!debug.game) return null;
      return debug.game.scene.scenes.find((scene) =>
        scene instanceof ChapterScene && (scene.sys.isActive() || scene.sys.isPaused())) || null;
    },

    /**
     * Springt in Kapitel n – im laufenden Lauf direkt, sonst mit neuem Lauf.
     * @param {number} n
     * @param {{skipIntro?: boolean}} [opts]
     */
    startChapter(n, { skipIntro = true } = {}) {
      const gameScene = getGameScene();
      if (gameScene && gameScene.getPhase() !== GameScene.PHASE.FINISHED) {
        return gameScene.startChapter(n, { skipIntro });
      }
      const manager = debug.game.scene;
      ['Boot', 'Menu', 'GameOver'].forEach((key) => {
        if (manager.isActive(key) || manager.isPaused(key)) manager.stop(key);
      });
      manager.start('Game', { startChapter: n, skipIntro });
      return true;
    },

    /** „Los geht's“ auf der Titelkarte. @returns {boolean} */
    skipIntro: () => {
      const gameScene = getGameScene();
      return gameScene ? gameScene.skipIntro() : false;
    },

    /** Löst das aktive Kapitel (debugSolve). */
    solve: () => {
      const chapterScene = debug.getChapterScene();
      if (!chapterScene) throw new Error('Kein aktives Kapitel – solve() nicht möglich.');
      return chapterScene.debugSolve();
    },

    /** Setzt den Frust auf v (über add/reduce, damit Events und Rage-Quit greifen). */
    setFrustration: (v) => {
      const target = Math.max(0, Math.min(CONFIG.FRUSTRATION.MAX, Number(v) || 0));
      const delta = target - GameState.getFrustration();
      if (delta > 0) GameState.addFrustration(delta, 'debug');
      else if (delta < 0) GameState.reduceFrustration(-delta, 'debug');
      return GameState.getFrustration();
    },

    /** Zeitsprung um m Spielminuten. */
    addMinutes: (m) => {
      GameState.advanceClock(Number(m) || 0, 'debug');
      return GameState.getClockMinutes();
    },

    // --- Zusätze (optional) ---------------------------------------------------

    /** @returns {string|null} Phase der GameScene ('intro', 'playing', …) */
    getPhase: () => {
      const gameScene = getGameScene();
      return gameScene ? gameScene.getPhase() : null;
    },

    /** @returns {Phaser.Scene|null} */
    getScene: (key) => (debug.game ? debug.game.scene.getScene(key) : null),

    /** @returns {string|null} Status einer Szene ('running', 'paused', 'shutdown', …) */
    getSceneStatus: (key) => {
      const scene = debug.getScene(key);
      return scene ? STATUS_NAMES[scene.sys.settings.status] || String(scene.sys.settings.status) : null;
    },

    /** Leert das Event-Protokoll. */
    clearEvents: () => {
      debug.events.length = 0;
    },

    /** Kapitel-Klassen, die gerade Platzhalter sind (Nummern). */
    placeholderChapters: chapterClasses
      .map((cls, index) => (cls.prototype instanceof PlaceholderChapterScene ? index + 1 : null))
      .filter((id) => id !== null),
  };

  /** @returns {GameScene|null} laufende oder pausierte GameScene */
  function getGameScene() {
    const scene = debug.game ? debug.game.scene.getScene('Game') : null;
    return scene && (scene.sys.isActive() || scene.sys.isPaused()) ? scene : null;
  }

  // Protokoll aller GameState-Events (gedeckelt, damit lange Sitzungen nicht volllaufen)
  if (typeof GameState !== 'undefined' && typeof EVENTS !== 'undefined') {
    Object.values(EVENTS).forEach((eventName) => {
      GameState.on(eventName, (payload) => {
        debug.events.push({ event: eventName, payload });
        if (debug.events.length > MAX_EVENT_LOG) {
          const index = debug.events.findIndex((entry) => entry.event === EVENTS.STATE_CHANGED);
          debug.events.splice(index >= 0 ? index : 0, 1);
        }
      });
    });
  }
  window.__EDU_DEBUG = debug;

  // ---------------------------------------------------------------------------
  // 4. Spiel starten
  // ---------------------------------------------------------------------------
  debug.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: CONFIG.WIDTH,
    height: CONFIG.HEIGHT,
    backgroundColor: CONFIG.CSS.BG_DEEP,
    title: CONFIG.TITLE,
    version: CONFIG.VERSION,
    banner: false,
    disableContextMenu: true, // Long-Press (Kapitel 5) soll kein Kontextmenü öffnen
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, MenuScene, GameScene, ...chapterClasses, HUDScene, GameOverScene],
  });
})();
