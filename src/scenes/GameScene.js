/**
 * GameScene.js – Ablaufsteuerung eines Laufs (Key 'Game', Daten { startChapter = 1, skipIntro }).
 *
 * Startet den Lauf (GameState.startRun) und das HUD, zeigt vor jedem Kapitel die
 * Papier-Titelkarte mit Typewriter-Intro (Uhr steht), startet die Kapitel-Szene und
 * reagiert auf CHAPTER_COMPLETE (nächstes Kapitel bzw. Sieg) und RAGE_QUIT (verloren).
 * update() lässt die Spieluhr laufen – aber nur, solange ein Kapitel läuft.
 *
 * Phasen: 'idle' → 'intro' → 'playing' → 'transition' → 'intro' … → 'finished'.
 * Pause ist davon unabhängig (GameState.isPaused) und friert Kapitel + diese Szene ein.
 *
 * Phaser-Hinweis: ScenePlugin-Aufrufe (this.scene.stop/launch/start) werden erst im
 * nächsten Frame ausgeführt – in Aufrufreihenfolge. Pause/Fortsetzen erfolgt sofort über
 * den SceneManager und nur bei passendem Status (resume auf gestoppte Szenen wäre fatal).
 *
 * Global: GameScene.
 * Abhängigkeiten (zur Laufzeit): Phaser, CONFIG, RUNTIME, EVENTS, GameState, Storage, UI, FX,
 * MenuScene (Hintergrund), ChapterScene-Unterklassen, HUDScene, GameOverScene.
 */

class GameScene extends Phaser.Scene {
  /** Phasen eines Laufs. */
  static PHASE = Object.freeze({
    IDLE: 'idle',
    INTRO: 'intro',
    PLAYING: 'playing',
    TRANSITION: 'transition',
    FINISHED: 'finished',
  });

  /** Übergänge (ms). */
  static TIMING = Object.freeze({
    TRANSITION_OUT_MS: 380, // fertiges Kapitel ausblenden
    INTRO_FADE_MS: 280,     // Titelkarte einblenden
    RAGE_DELAY_MS: 950,     // Rage-Moment, bevor GameOver kommt
  });

  /** Layout der Papier-Titelkarte (px). */
  static CARD = Object.freeze({
    WIDTH: 584,
    PADDING_X: 44,
    PADDING_TOP: 34,
    PADDING_BOTTOM: 28,
    ANGLE: -0.8,           // Grad – minimal schräg
    SHADOW_X: 8,
    SHADOW_Y: 10,
    SHADOW_ALPHA: 0.42,
    HEADER_SIZE: 13,
    FILE_SIZE: 11,
    TITLE_SIZE: 30,
    TEXT_SIZE: 15,
    TEXT_LINE_SPACING: 6,
    GAP_HEADER_TITLE: 8,
    GAP_TITLE_RULE: 12,
    GAP_RULE_TEXT: 16,
    GAP_TEXT_BUTTON: 26,
    RULE_ALPHA: 0.25,
    BUTTON_WIDTH: 180,
    BUTTON_HEIGHT: 44,
    HINT_SIZE: 12,
  });

  constructor() {
    super({ key: 'Game' });
  }

  /**
   * @param {{startChapter?: number, skipIntro?: boolean}} [data]
   */
  create(data = {}) {
    const P = GameScene.PHASE;
    const startChapter = GameScene.clampChapterId(data.startChapter || 1);
    const skipIntro = typeof data.skipIntro === 'boolean' ? data.skipIntro : RUNTIME.skipIntro;

    // Instanzfelder hier (nicht im Konstruktor) – scene.restart() ruft create() erneut auf.
    this.phase = P.IDLE;
    this.hasFinishedRun = false;
    this.runStartChapter = startChapter;
    this.currentChapterId = startChapter;
    this.intro = null;
    this.pendingTimer = null;
    this.chapterCreateHooks = [];

    this.cameras.main.setBackgroundColor(CONFIG.CSS.BG);
    MenuScene.drawBackdrop(this);

    GameState.on(EVENTS.CHAPTER_COMPLETE, this.handleChapterComplete, this);
    GameState.on(EVENTS.RAGE_QUIT, this.handleRageQuit, this);
    this.seenKeyEvents = new WeakSet(); // Phaser 3.90 meldet keydowns teils mehrfach
    this.input.keyboard.on('keydown', this.handleKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    GameState.startRun(startChapter);
    this.scene.launch('HUD');
    this.startChapter(startChapter, { skipIntro });
  }

  /**
   * Spieluhr: läuft nur während eines Kapitels (nicht im Intro, nicht im Übergang).
   * @param {number} time
   * @param {number} delta ms seit dem letzten Frame
   */
  update(time, delta) {
    if (this.phase === GameScene.PHASE.PLAYING) GameState.tick(delta);
  }

  // ---------------------------------------------------------------------------
  // Öffentliche API (HUD, Debug-API, Tests)
  // ---------------------------------------------------------------------------

  /**
   * Wechselt zu Kapitel `id` (stoppt ein laufendes Kapitel): Titelkarte oder direkt los.
   * @param {number} id 1–5
   * @param {{skipIntro?: boolean}} [opts] Standard RUNTIME.skipIntro
   * @returns {boolean} false, wenn der Lauf schon vorbei ist
   */
  startChapter(id, { skipIntro = RUNTIME.skipIntro } = {}) {
    if (this.phase === GameScene.PHASE.FINISHED) return false;
    const chapterId = GameScene.clampChapterId(id);
    this.cancelPending();
    this.destroyIntro();
    this.clearPause({ resumeChapter: false });
    this.stopChapterScenes();

    this.currentChapterId = chapterId;
    const chapter = CONFIG.CHAPTERS[chapterId - 1];
    GameState.setCurrentChapter(chapterId);
    GameState.setObjective(chapter.short);

    if (skipIntro) this.launchChapter();
    else this.showIntro();
    return true;
  }

  /** Startet das aktuelle Kapitel neu (ohne Intro). Hebt eine Pause auf. */
  restartChapter() {
    if (this.phase === GameScene.PHASE.FINISHED) return false;
    this.cancelPending();
    this.destroyIntro();
    this.clearPause({ resumeChapter: false });
    this.stopChapterScenes();
    GameState.setObjective(CONFIG.CHAPTERS[this.currentChapterId - 1].short);
    this.launchChapter();
    return true;
  }

  /**
   * Pause an/aus. Pausieren geht im Intro und im Kapitel; Fortsetzen immer.
   * @returns {boolean} neuer Pausenzustand
   */
  togglePause() {
    const P = GameScene.PHASE;
    const isPaused = GameState.isPaused();
    if (isPaused) {
      this.clearPause({ resumeChapter: true });
      return false;
    }
    if (this.phase !== P.INTRO && this.phase !== P.PLAYING) return false;
    GameState.setPaused(true);
    this.pauseSceneNow(this.getCurrentChapterKey());
    this.pauseSceneNow(this.sys.settings.key);
    return true;
  }

  /** @returns {boolean} */
  isPaused() {
    return GameState.isPaused();
  }

  /** Lauf abbrechen und zurück ins Hauptmenü. */
  quitToMenu() {
    if (this.hasFinishedRun) return false;
    this.hasFinishedRun = true;
    this.phase = GameScene.PHASE.FINISHED;
    this.cancelPending();
    this.destroyIntro();
    this.clearPause({ resumeChapter: false });
    GameState.abortRun();
    this.stopChapterScenes();
    this.scene.stop('HUD');
    this.scene.start('Menu');
    return true;
  }

  /**
   * Beendet den Lauf und zeigt den GameOver-Bildschirm.
   * @param {boolean} won
   * @param {string|null} [reason]
   * @returns {object|null} Ergebnis von GameState.finishRun
   */
  finish(won, reason = null) {
    if (this.hasFinishedRun) return null;
    this.hasFinishedRun = true;
    this.phase = GameScene.PHASE.FINISHED;
    this.cancelPending();
    this.destroyIntro();
    this.clearPause({ resumeChapter: false });

    const snapshot = GameState.getSnapshot();
    const result = GameState.finishRun(won, reason);
    const data = Object.assign({}, result, {
      startChapter: this.runStartChapter,
      reachedChapter: this.currentChapterId,
      failsByChapter: GameScene.failsByChapter(snapshot, result, this.runStartChapter, this.currentChapterId),
    });
    this.stopChapterScenes();
    this.scene.stop('HUD');
    this.scene.start('GameOver', data);
    return result;
  }

  /** @returns {ChapterScene|null} laufende oder pausierte Kapitel-Szene */
  getActiveChapterScene() {
    const key = this.getCurrentChapterKey();
    const scene = key ? this.scene.get(key) : null;
    if (scene && (scene.sys.isActive() || scene.sys.isPaused())) return scene;
    return null;
  }

  /**
   * „Los geht's“ auf der Titelkarte (auch mitten im Typewriter).
   * @returns {boolean} true, wenn ein Intro lief
   */
  skipIntro() {
    if (this.phase !== GameScene.PHASE.INTRO) return false;
    this.launchChapter();
    return true;
  }

  /** @returns {string} aktuelle Phase (siehe GameScene.PHASE) */
  getPhase() {
    return this.phase;
  }

  /** @returns {number} */
  getCurrentChapterId() {
    return this.currentChapterId;
  }

  /** @returns {boolean} true, solange der Intro-Text noch getippt wird */
  isIntroTyping() {
    return Boolean(this.intro && this.intro.isTyping);
  }

  /** @returns {{x: number, y: number}|null} Mitte des „Los geht's“-Buttons (für Tests) */
  getIntroButtonCenter() {
    if (!this.intro) return null;
    const rect = this.intro.buttonRect;
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }

  // ---------------------------------------------------------------------------
  // Kapitel starten/stoppen
  // ---------------------------------------------------------------------------

  /** Startet die Szene des aktuellen Kapitels; die Uhr läuft ab jetzt. */
  launchChapter() {
    if (this.phase === GameScene.PHASE.FINISHED) return;
    this.destroyIntro();
    const key = this.getCurrentChapterKey();
    const target = this.scene.get(key);
    if (!target) {
      console.error(`[Game] Kapitel-Szene „${key}“ ist nicht registriert.`);
      return;
    }
    this.phase = GameScene.PHASE.PLAYING;
    this.addChapterCreateHook(target);
    this.scene.launch(key);
  }

  /**
   * Stoppt alle Kapitel-Szenen (eingereiht, also im nächsten Frame). Bewusst ohne
   * Statusprüfung: so wird auch ein im selben Frame eingereihter Start sicher abgeräumt.
   */
  stopChapterScenes() {
    CONFIG.CHAPTERS.forEach(({ key }) => {
      if (this.scene.get(key)) this.scene.stop(key);
    });
  }

  /** @returns {string} Szenen-Key des aktuellen Kapitels */
  getCurrentChapterKey() {
    const chapter = CONFIG.CHAPTERS[this.currentChapterId - 1];
    return chapter ? chapter.key : null;
  }

  /**
   * Meldet sich einmalig beim CREATE-Event der Kapitel-Szene: Debug-Bereitschaft setzen,
   * eine inzwischen gesetzte Pause nachziehen.
   * @param {Phaser.Scene} target
   */
  addChapterCreateHook(target) {
    const hook = () => {
      this.chapterCreateHooks = this.chapterCreateHooks.filter((entry) => entry.hook !== hook);
      if (this.phase === GameScene.PHASE.FINISHED) return;
      if (GameState.isPaused()) this.pauseSceneNow(target.sys.settings.key);
      GameScene.markReady();
    };
    target.events.once(Phaser.Scenes.Events.CREATE, hook, this);
    this.chapterCreateHooks.push({ target, hook });
  }

  /** Entfernt noch offene CREATE-Hooks (bei shutdown). */
  clearChapterCreateHooks() {
    this.chapterCreateHooks.forEach(({ target, hook }) => {
      if (target.events) target.events.off(Phaser.Scenes.Events.CREATE, hook, this);
    });
    this.chapterCreateHooks = [];
  }

  // ---------------------------------------------------------------------------
  // Pause
  // ---------------------------------------------------------------------------

  /**
   * Hebt eine Pause auf (GameState, diese Szene, optional das Kapitel).
   * @param {{resumeChapter: boolean}} opts resumeChapter false, wenn das Kapitel ohnehin gestoppt wird
   */
  clearPause({ resumeChapter }) {
    if (GameState.isPaused()) GameState.setPaused(false);
    this.resumeSceneNow(this.sys.settings.key);
    if (resumeChapter) this.resumeSceneNow(this.getCurrentChapterKey());
  }

  /** Pausiert eine Szene sofort – nur wenn sie wirklich läuft. */
  pauseSceneNow(key) {
    const target = key ? this.game.scene.getScene(key) : null;
    if (target && target.sys.isActive()) this.game.scene.pause(key);
  }

  /** Setzt eine Szene sofort fort – nur wenn sie wirklich pausiert ist. */
  resumeSceneNow(key) {
    const target = key ? this.game.scene.getScene(key) : null;
    if (target && target.sys.isPaused()) this.game.scene.resume(key);
  }

  // ---------------------------------------------------------------------------
  // GameState-Ereignisse
  // ---------------------------------------------------------------------------

  /**
   * Kapitel fertig → ausblenden, nächstes Kapitel freischalten und zeigen bzw. Sieg.
   * Doppelte oder veraltete Meldungen werden ignoriert.
   * @param {{chapterId: number}} payload
   */
  handleChapterComplete(payload) {
    const chapterId = payload ? Number(payload.chapterId) : NaN;
    if (this.phase !== GameScene.PHASE.PLAYING || chapterId !== this.currentChapterId) return;
    this.phase = GameScene.PHASE.TRANSITION;
    Storage.unlockChapter(Math.min(chapterId + 1, CONFIG.CHAPTERS.length));

    const T = GameScene.TIMING;
    const chapterScene = this.getActiveChapterScene();
    if (chapterScene && chapterScene.cameras && chapterScene.cameras.main) {
      const deep = Phaser.Display.Color.IntegerToRGB(CONFIG.COLORS.BG_DEEP);
      chapterScene.cameras.main.fadeOut(T.TRANSITION_OUT_MS, deep.r, deep.g, deep.b);
    }
    this.cancelPending();
    this.pendingTimer = this.time.delayedCall(T.TRANSITION_OUT_MS, () => {
      this.pendingTimer = null;
      this.stopChapterScenes();
      if (chapterId >= CONFIG.CHAPTERS.length) this.finish(true);
      else this.startChapter(chapterId + 1);
    });
  }

  /**
   * Frust 100 % → kurzer Rage-Moment (HUD blitzt), dann GameOver (verloren).
   * Funktioniert in jeder Phase: Intro, Kapitel, Übergang, Pause.
   */
  handleRageQuit() {
    const P = GameScene.PHASE;
    if (this.hasFinishedRun || this.phase === P.FINISHED || this.phase === P.IDLE) return;
    this.phase = P.FINISHED;
    this.cancelPending();
    // GameScene muss weiterlaufen, damit der Timer feuert; das Kapitel bleibt, wie es ist.
    this.clearPause({ resumeChapter: true });
    if (this.intro && this.intro.button) this.intro.button.setEnabled(false);
    this.pendingTimer = this.time.delayedCall(GameScene.TIMING.RAGE_DELAY_MS, () => {
      this.pendingTimer = null;
      this.finish(false, 'rage');
    });
  }

  /** Bricht einen laufenden Übergangs-Timer ab. */
  cancelPending() {
    if (this.pendingTimer) {
      this.pendingTimer.remove(false);
      this.pendingTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Titelkarte
  // ---------------------------------------------------------------------------

  /** Zeigt die Papier-Titelkarte des aktuellen Kapitels; die Uhr steht. */
  showIntro() {
    this.phase = GameScene.PHASE.INTRO;
    const chapter = CONFIG.CHAPTERS[this.currentChapterId - 1];
    this.intro = this.buildIntroCard(chapter);

    const deep = Phaser.Display.Color.IntegerToRGB(CONFIG.COLORS.BG_DEEP);
    this.cameras.main.fadeIn(GameScene.TIMING.INTRO_FADE_MS, deep.r, deep.g, deep.b);
    UI.sound('whoosh');

    const intro = this.intro;
    intro.isTyping = true;
    try {
      intro.typewriter = FX.typewriter(this, intro.bodyText, intro.fullText, {
        onComplete: () => {
          intro.isTyping = false;
        },
      });
    } catch (err) {
      console.error('[Game] Typewriter fehlgeschlagen:', err);
      intro.bodyText.setText(intro.fullText);
      intro.isTyping = false;
    }
    GameScene.markReady();
  }

  /**
   * Klick/Leertaste/Enter auf der Titelkarte: erst Text komplett zeigen, dann starten.
   */
  advanceIntro() {
    if (this.phase !== GameScene.PHASE.INTRO || !this.intro || GameState.isPaused()) return;
    if (this.intro.isTyping) {
      this.completeIntroText();
      return;
    }
    UI.sound('click');
    this.launchChapter();
  }

  /** Typewriter überspringen: Text sofort vollständig. */
  completeIntroText() {
    const intro = this.intro;
    if (!intro) return;
    try {
      if (intro.typewriter && typeof intro.typewriter.skip === 'function') intro.typewriter.skip();
    } catch (err) {
      console.error('[Game] Typewriter-Skip fehlgeschlagen:', err);
    }
    intro.bodyText.setText(intro.fullText);
    intro.isTyping = false;
  }

  /**
   * Baut die Titelkarte: Schatten, Papier (leicht schräg), Kopfzeile, Titel, Linie,
   * Intro-Text (vorab umbrochen, damit beim Tippen nichts springt), Hinweis, Button.
   * @param {{id: number, title: string, intro: string}} chapter
   * @returns {object} Intro-Zustand
   */
  buildIntroCard(chapter) {
    const C = GameScene.CARD;
    const area = CONFIG.PLAY_AREA;
    const wrapWidth = C.WIDTH - 2 * C.PADDING_X;
    const objects = [];

    // Klick irgendwo auf die Spielfläche = weiter
    const clickZone = this.add.rectangle(area.x, area.y, area.width, area.height, CONFIG.COLORS.BG, 0.001)
      .setOrigin(0)
      .setInteractive();
    clickZone.on('pointerup', () => this.advanceIntro());
    objects.push(clickZone);

    // Texte erzeugen und messen (lokale Koordinaten relativ zur Kartenmitte folgen unten)
    const header = UI.text(this, 0, 0, `KAPITEL ${chapter.id} VON ${CONFIG.CHAPTERS.length}`, {
      font: 'STAMP', size: C.HEADER_SIZE, color: CONFIG.CSS.DHBW_RED,
    });
    const fileNumber = UI.text(this, 0, 0, `Az. EDU-2026/${String(chapter.id).padStart(2, '0')}`, {
      font: 'PAPER', size: C.FILE_SIZE, color: CONFIG.CSS.INK_MUTED, origin: { x: 1, y: 0 },
    });
    const title = UI.text(this, 0, 0, chapter.title, {
      font: 'PAPER', size: C.TITLE_SIZE, bold: true, color: CONFIG.CSS.INK, wrap: wrapWidth,
    });
    const body = UI.text(this, 0, 0, chapter.intro, {
      font: 'PAPER', size: C.TEXT_SIZE, color: CONFIG.CSS.INK, wrap: wrapWidth, lineSpacing: C.TEXT_LINE_SPACING,
    });
    const fullText = body.getWrappedText(chapter.intro).join('\n');
    body.setWordWrapWidth(null);
    body.setText(fullText);
    const bodyHeight = body.height;
    body.setText('');
    const hint = UI.text(this, 0, 0, 'Klick, Leertaste oder Enter', {
      font: 'PAPER', size: C.HINT_SIZE, color: CONFIG.CSS.INK_MUTED, origin: { x: 0, y: 0.5 },
    });

    const headerTop = C.PADDING_TOP;
    const titleTop = headerTop + header.height + C.GAP_HEADER_TITLE;
    const ruleY = titleTop + title.height + C.GAP_TITLE_RULE;
    const bodyTop = ruleY + C.GAP_RULE_TEXT;
    const buttonTop = bodyTop + bodyHeight + C.GAP_TEXT_BUTTON;
    const height = Math.round(buttonTop + C.BUTTON_HEIGHT + C.PADDING_BOTTOM);

    const left = UI.centerX(C.WIDTH);
    const top = Math.round(area.y + (area.height - height) / 2);
    const halfW = C.WIDTH / 2;
    const halfH = height / 2;

    // Karte als Container um die Mitte → Drehung um die Kartenmitte
    const card = this.add.container(left + halfW, top + halfH).setDepth(CONFIG.DEPTH.UI);
    const shadow = this.add.rectangle(-halfW + C.SHADOW_X, -halfH + C.SHADOW_Y, C.WIDTH, height,
      CONFIG.COLORS.SHADOW, C.SHADOW_ALPHA).setOrigin(0);
    const paper = this.add.rectangle(-halfW, -halfH, C.WIDTH, height, CONFIG.COLORS.PAPER).setOrigin(0);
    const rule = this.add.rectangle(-halfW + C.PADDING_X, -halfH + ruleY, wrapWidth, 1, CONFIG.COLORS.INK, C.RULE_ALPHA)
      .setOrigin(0);
    header.setPosition(-halfW + C.PADDING_X, -halfH + headerTop);
    fileNumber.setPosition(halfW - C.PADDING_X, -halfH + headerTop);
    title.setPosition(-halfW + C.PADDING_X, -halfH + titleTop);
    body.setPosition(-halfW + C.PADDING_X, -halfH + bodyTop);
    hint.setPosition(-halfW + C.PADDING_X, -halfH + buttonTop + C.BUTTON_HEIGHT / 2);
    card.add([shadow, paper, header, fileNumber, title, rule, body, hint]);
    card.setAngle(C.ANGLE);
    objects.push(card);

    // Button gerade (nicht gedreht), rechts unten auf der Karte
    const buttonRect = {
      x: left + C.WIDTH - C.PADDING_X - C.BUTTON_WIDTH,
      y: top + buttonTop,
      width: C.BUTTON_WIDTH,
      height: C.BUTTON_HEIGHT,
    };
    const button = new UI.Button(this, buttonRect.x, buttonRect.y, {
      text: 'Los geht’s',
      variant: 'primary',
      width: C.BUTTON_WIDTH,
      height: C.BUTTON_HEIGHT,
      onClick: () => this.skipIntro(),
    });
    button.setDepth(CONFIG.DEPTH.UI + 1);
    objects.push(button);

    return { objects, card, button, buttonRect, bodyText: body, fullText, isTyping: false, typewriter: null };
  }

  /** Entfernt die Titelkarte (falls vorhanden). */
  destroyIntro() {
    if (!this.intro) return;
    const intro = this.intro;
    this.intro = null;
    try {
      if (intro.typewriter && typeof intro.typewriter.stop === 'function') intro.typewriter.stop();
    } catch (err) {
      // Typewriter ist evtl. schon fertig – egal, die Karte wird ohnehin entfernt.
    }
    intro.objects.forEach((object) => object.destroy());
  }

  // ---------------------------------------------------------------------------
  // Eingaben und Aufräumen
  // ---------------------------------------------------------------------------

  /** @param {KeyboardEvent} event */
  handleKeyDown(event) {
    if (!event || this.seenKeyEvents.has(event)) return;
    this.seenKeyEvents.add(event);
    if (event.repeat || this.phase !== GameScene.PHASE.INTRO) return;
    if (event.key === 'Enter' || event.key === ' ' || event.code === 'Space') this.advanceIntro();
  }

  /** Listener abmelden; falls die Szene von außen gestoppt wurde, Kapitel und HUD mitnehmen. */
  handleShutdown() {
    GameState.off(EVENTS.CHAPTER_COMPLETE, this.handleChapterComplete, this);
    GameState.off(EVENTS.RAGE_QUIT, this.handleRageQuit, this);
    if (this.input && this.input.keyboard) this.input.keyboard.off('keydown', this.handleKeyDown, this);
    this.clearChapterCreateHooks();
    this.intro = null; // Objekte räumt Phaser beim shutdown selbst ab
    this.pendingTimer = null;
    this.stopChapterScenes();
    if (this.scene.get('HUD')) this.scene.stop('HUD');
    this.phase = GameScene.PHASE.FINISHED;
  }

  // ---------------------------------------------------------------------------
  // Statische Helfer
  // ---------------------------------------------------------------------------

  /**
   * @param {*} id
   * @returns {number} gültige Kapitelnummer 1–5
   */
  static clampChapterId(id) {
    const value = Math.round(Number(id));
    if (!Number.isFinite(value)) return 1;
    return Phaser.Math.Clamp(value, 1, CONFIG.CHAPTERS.length);
  }

  /**
   * Fehlversuche je Kapitel aus Ergebnis/Snapshot ({ 1: n, … }; null = nicht gespielt).
   * @param {object} snapshot GameState.getSnapshot() vor finishRun
   * @param {object} result Ergebnis von finishRun
   * @param {number} [firstId=1] erstes gespieltes Kapitel (Start des Laufs)
   * @param {number} [lastId=5] zuletzt erreichtes Kapitel
   * @returns {Object<number, number|null>}
   */
  static failsByChapter(snapshot, result, firstId = 1, lastId = CONFIG.CHAPTERS.length) {
    const attempts = (snapshot && snapshot.attempts) || {};
    const stats = (result && result.chapterStats) || {};
    const fails = {};
    CONFIG.CHAPTERS.forEach(({ id }) => {
      if (id < firstId || id > lastId) fails[id] = null;
      else if (attempts[id] && typeof attempts[id].fails === 'number') fails[id] = attempts[id].fails;
      else if (stats[id] && typeof stats[id].fails === 'number') fails[id] = stats[id].fails;
      else fails[id] = 0;
    });
    return fails;
  }

  /** Setzt window.__EDU_DEBUG.ready (Tests warten darauf). */
  static markReady() {
    if (typeof window !== 'undefined' && window.__EDU_DEBUG) window.__EDU_DEBUG.ready = true;
  }
}
